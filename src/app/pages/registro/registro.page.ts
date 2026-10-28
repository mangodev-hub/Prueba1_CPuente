import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonList, IonItem, IonInput, IonTextarea, IonSelect, IonSelectOption,
  IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonBadge, IonNote, IonSpinner, IonGrid, IonRow, IonCol,
  AlertController, ToastController, ViewWillEnter, ViewDidEnter
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  camera, trash, locate, cloudDownload, warning, checkmarkCircle,
  alertCircle, mapOutline, save, refresh
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';

import { IncidenciasService } from '../../core/services/incidencias';
import { StorageService, BorradorIncidencia } from '../../core/services/storage';
import { WeatherService } from '../../core/services/weather';
import { LocationMediaService } from '../../core/services/location-media';
import {
  ClimaInfo,
  PrioridadIncidencia,
  TipoIncidencia
} from '../../core/models/incidencia.model';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonList, IonItem, IonInput, IonTextarea, IonSelect, IonSelectOption,
    IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonBadge, IonNote, IonSpinner, IonGrid, IonRow, IonCol
  ]
})
export class RegistroPage implements OnInit, OnDestroy, ViewWillEnter, ViewDidEnter {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private cdr = inject(ChangeDetectorRef);

  private incidenciasService = inject(IncidenciasService);
  private storageService = inject(StorageService);
  private weatherService = inject(WeatherService);
  private locationMediaService = inject(LocationMediaService);

  form!: FormGroup;
  private subs = new Subscription();
  private ignorarGuardadoBorrador = false;

  // Catálogos del formulario (R5)
  readonly tipos: TipoIncidencia[] = [
    'Luminaria dañada',
    'Bache',
    'Señalización deteriorada',
    'Alcantarilla obstruida',
    'Daño en parque'
  ];
  readonly prioridades: PrioridadIncidencia[] = ['baja', 'media', 'alta'];

  // Estados de Fotografía y Ubicación (R6 y R7)
  permisoCamaraDenegado = false;
  mensajeErrorCamara = '';
  obteniendoGps = false;
  mensajeEstadoGps = '';

  // Estados Meteorológicos (R4)
  consultandoClima = false;
  climaActual: ClimaInfo | null = null;
  errorClimaMensaje = '';
  climaConsultadoOIntentado = false;
  private coordsClimaConsultado: { lat: number; lng: number } | null = null;

  // Guardado remoto
  guardando = false;

  // Mapa Leaflet (Plus R7 / R10)
  private map!: L.Map;
  private marker!: L.Marker;
  private readonly QUITO_DEFAULT_LAT = -0.2103;
  private readonly QUITO_DEFAULT_LNG = -78.4891;

  constructor() {
    addIcons({
      camera, trash, locate, cloudDownload, warning, checkmarkCircle,
      alertCircle, mapOutline, save, refresh
    });
  }

  ngOnInit() {
    this.inicializarFormulario();
    this.configurarReglasDinamicas();
    this.configurarAutoGuardadoBorrador();
  }

  async ionViewWillEnter() {
    await this.verificarBorradorExistente();
  }

  ionViewDidEnter() {
    this.inicializarMapaLeaflet();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    if (this.map) {
      this.map.remove();
    }
  }

  private inicializarFormulario() {
    this.form = this.fb.group({
      tipo: ['Luminaria dañada', [Validators.required]],
      descripcion: ['', [Validators.required, Validators.minLength(10)]],
      direccion: ['', [Validators.required, Validators.minLength(5)]],
      sector: ['', [Validators.required]],
      prioridad: ['media', [Validators.required]],
      fotografia: [null],
      latitud: [null, [Validators.min(-90), Validators.max(90)]],
      longitud: [null, [Validators.min(-180), Validators.max(180)]]
    });
  }

  private configurarReglasDinamicas() {
    // Regla R5/R6: Si prioridad === 'alta', la fotografía es obligatoria
    const subPrioridad = this.form.get('prioridad')!.valueChanges.subscribe((prioridad: PrioridadIncidencia) => {
      const fotoCtrl = this.form.get('fotografia')!;
      if (prioridad === 'alta') {
        fotoCtrl.setValidators([Validators.required]);
      } else {
        fotoCtrl.clearValidators();
      }
      fotoCtrl.updateValueAndValidity({ emitEvent: false });
      this.cdr.markForCheck();
    });

    // Regla R7: Si tipo === 'Bache', las coordenadas son obligatorias
    const subTipo = this.form.get('tipo')!.valueChanges.subscribe((tipo: TipoIncidencia) => {
      const latCtrl = this.form.get('latitud')!;
      const lngCtrl = this.form.get('longitud')!;

      if (tipo === 'Bache') {
        latCtrl.setValidators([Validators.required, Validators.min(-90), Validators.max(90)]);
        lngCtrl.setValidators([Validators.required, Validators.min(-180), Validators.max(180)]);
      } else {
        latCtrl.setValidators([Validators.min(-90), Validators.max(90)]);
        lngCtrl.setValidators([Validators.min(-180), Validators.max(180)]);
      }
      latCtrl.updateValueAndValidity({ emitEvent: false });
      lngCtrl.updateValueAndValidity({ emitEvent: false });
      this.cdr.markForCheck();
    });

    // Regla R4: Evitar resultados inconsistentes si el inspector edita las coordenadas después de consultar el clima
    const invalidarClimaSiCambiaCoordenada = () => {
      if (this.ignorarGuardadoBorrador || !this.coordsClimaConsultado) return;
      if (!this.climaEsConsistenteConCoordenadas()) {
        this.climaActual = null;
        this.errorClimaMensaje = '';
        this.climaConsultadoOIntentado = false;
        this.coordsClimaConsultado = null;
        this.cdr.markForCheck();
      }
    };

    const subLat = this.form.get('latitud')!.valueChanges.subscribe(() => invalidarClimaSiCambiaCoordenada());
    const subLng = this.form.get('longitud')!.valueChanges.subscribe(() => invalidarClimaSiCambiaCoordenada());

    this.subs.add(subPrioridad);
    this.subs.add(subTipo);
    this.subs.add(subLat);
    this.subs.add(subLng);
  }

  private configurarAutoGuardadoBorrador() {
    const subCambios = this.form.valueChanges.subscribe(() => {
      this.persistirBorradorActual();
    });

    this.subs.add(subCambios);
  }

  private persistirBorradorActual() {
    if (this.ignorarGuardadoBorrador || !this.form) return;

    const valores = this.form.value;
    const tieneDatos =
      valores.tipo !== 'Luminaria dañada' ||
      valores.prioridad !== 'media' ||
      Boolean(valores.descripcion?.trim()) ||
      Boolean(valores.direccion?.trim()) ||
      Boolean(valores.sector?.trim()) ||
      Boolean(valores.fotografia) ||
      (valores.latitud !== null && valores.latitud !== '') ||
      (valores.longitud !== null && valores.longitud !== '') ||
      this.climaActual !== null;

    if (tieneDatos) {
      const borrador: BorradorIncidencia = {
        ...valores,
        clima: this.climaActual,
        fechaGuardado: new Date().toISOString()
      };
      this.storageService.guardarBorrador(borrador);
    }
  }

  private async verificarBorradorExistente() {
    const borrador = await this.storageService.obtenerBorrador();
    if (!borrador) return;

    // Si ya confirmó "Continuar registro" en la alerta de inicio al abrir la app (R8)
    const continuarDirecto = this.route.snapshot.queryParamMap.get('continuarBorrador') === '1';
    if (continuarDirecto) {
      this.restaurarDatosBorrador(borrador);
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Registro incompleto detectado',
      message: 'Existe un formulario sin finalizar guardado anteriormente. ¿Desea continuar con los datos capturados o descartarlo?',
      backdropDismiss: false,
      buttons: [
        {
          text: 'Descartar',
          role: 'destructive',
          handler: async () => {
            await this.storageService.limpiarBorrador();
            this.resetearVista();
          }
        },
        {
          text: 'Continuar registro',
          handler: () => {
            this.restaurarDatosBorrador(borrador);
          }
        }
      ]
    });

    await alert.present();
  }

  private restaurarDatosBorrador(borrador: BorradorIncidencia) {
    this.ignorarGuardadoBorrador = true;
    this.form.patchValue({
      tipo: borrador.tipo || 'Luminaria dañada',
      descripcion: borrador.descripcion || '',
      direccion: borrador.direccion || '',
      sector: borrador.sector || '',
      prioridad: borrador.prioridad || 'media',
      fotografia: borrador.fotografia || null,
      latitud: borrador.latitud ?? null,
      longitud: borrador.longitud ?? null
    });

    if (borrador.clima) {
      this.climaActual = borrador.clima;
      this.climaConsultadoOIntentado = true;
      this.coordsClimaConsultado = this.obtenerCoordenadasParaClima();
    }

    if (borrador.latitud != null && borrador.longitud != null) {
      setTimeout(() => {
        this.sincronizarMarcadorMapa(borrador.latitud!, borrador.longitud!);
      }, 350);
    }
    this.ignorarGuardadoBorrador = false;
    this.cdr.markForCheck();
  }

  async capturarFoto() {
    this.permisoCamaraDenegado = false;
    this.mensajeErrorCamara = '';
    this.cdr.markForCheck();

    const resultado = await this.locationMediaService.capturarFotografia();

    if (resultado.estado === 'ok' && resultado.dataUrl) {
      // Actualiza solo la fotografía conservando intacto el resto del formulario
      this.form.patchValue({ fotografia: resultado.dataUrl });
      this.cdr.markForCheck();
      this.mostrarToast('Evidencia fotográfica adjuntada correctamente.', 'success');
      return;
    }

    if (resultado.estado === 'cancelado') {
      // R6: Si cancela la captura, los demás datos permanecen intactos
      this.mostrarToast('Captura cancelada. Los datos del formulario se mantienen intactos.', 'medium');
      return;
    }

    if (resultado.estado === 'permiso_denegado') {
      this.permisoCamaraDenegado = true;
      this.mensajeErrorCamara = resultado.mensaje || 'Permiso de cámara denegado.';
      this.cdr.markForCheck();
      return;
    }

    if (resultado.estado === 'error') {
      this.mensajeErrorCamara = resultado.mensaje || 'Error al abrir la cámara.';
      this.cdr.markForCheck();
    }
  }

  eliminarFoto() {
    this.form.patchValue({ fotografia: null });
    this.cdr.markForCheck();
  }

  private inicializarMapaLeaflet() {
    if (this.map) {
      this.map.invalidateSize();
      return;
    }

    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41]
    });
    L.Marker.prototype.options.icon = defaultIcon;

    this.map = L.map('mapa-registro').setView([this.QUITO_DEFAULT_LAT, this.QUITO_DEFAULT_LNG], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    // Al tocar el mapa se asignan las coordenadas y se consulta el clima (R4 y R7)
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      this.aplicarCoordenadasYConsultarClima(lat, lng, 'Coordenadas seleccionadas en el mapa.');
    });

    setTimeout(() => {
      this.map.invalidateSize();
      const latActual = this.form.get('latitud')?.value;
      const lngActual = this.form.get('longitud')?.value;
      if (latActual != null && latActual !== '' && lngActual != null && lngActual !== '') {
        this.sincronizarMarcadorMapa(Number(latActual), Number(lngActual));
      }
    }, 300);
  }

  private sincronizarMarcadorMapa(lat: number, lng: number) {
    if (!this.map) return;
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng]).addTo(this.map);
    }
    this.map.setView([lat, lng], 16);
  }

  async obtenerUbicacionGPS() {
    this.obteniendoGps = true;
    this.mensajeEstadoGps = '';
    this.cdr.markForCheck();

    const res = await this.locationMediaService.obtenerCoordenadasActuales();
    this.obteniendoGps = false;

    if (res.estado === 'ok' && res.latitud != null && res.longitud != null) {
      this.aplicarCoordenadasYConsultarClima(
        res.latitud,
        res.longitud,
        'Ubicación GPS obtenida con éxito.'
      );
    } else {
      this.mensajeEstadoGps = res.mensaje || 'No se pudo obtener GPS. Ingrese coordenadas manualmente.';
    }
    this.cdr.markForCheck();
  }

  usarCoordenadasManuales() {
    const lat = this.form.get('latitud')?.value;
    const lng = this.form.get('longitud')?.value;

    if (lat === null || lat === '' || lng === null || lng === '' || isNaN(Number(lat)) || isNaN(Number(lng))) {
      this.mostrarToast('Ingrese una latitud (-90 a 90) y longitud (-180 a 180) válidas.', 'warning');
      return;
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      this.mostrarToast('Las coordenadas están fuera de rango geográfico válido.', 'danger');
      return;
    }

    this.aplicarCoordenadasYConsultarClima(latNum, lngNum, 'Coordenadas manuales aplicadas.');
  }

  private aplicarCoordenadasYConsultarClima(lat: number, lng: number, aviso: string) {
    this.form.patchValue({ latitud: lat, longitud: lng });
    this.mensajeEstadoGps = aviso;
    this.sincronizarMarcadorMapa(lat, lng);
    this.cdr.markForCheck();
    this.consultarClima();
  }

  private obtenerCoordenadasParaClima(): { lat: number; lng: number } {
    const lat = this.form.get('latitud')?.value;
    const lng = this.form.get('longitud')?.value;

    const tieneAmbas =
      lat !== null && lat !== '' && !isNaN(Number(lat)) &&
      lng !== null && lng !== '' && !isNaN(Number(lng));

    return {
      lat: tieneAmbas ? Number(Number(lat).toFixed(6)) : this.QUITO_DEFAULT_LAT,
      lng: tieneAmbas ? Number(Number(lng).toFixed(6)) : this.QUITO_DEFAULT_LNG
    };
  }

  private climaEsConsistenteConCoordenadas(): boolean {
    if (!this.climaConsultadoOIntentado || !this.coordsClimaConsultado) {
      return false;
    }
    const actual = this.obtenerCoordenadasParaClima();
    return (
      this.coordsClimaConsultado.lat === actual.lat &&
      this.coordsClimaConsultado.lng === actual.lng
    );
  }

  consultarClima() {
    const latRaw = this.form.get('latitud')?.value;
    const lngRaw = this.form.get('longitud')?.value;

    // Si ingresó coordenadas manuales fuera de rango, validar antes de consultar
    if (
      (latRaw !== null && latRaw !== '' && (isNaN(Number(latRaw)) || Number(latRaw) < -90 || Number(latRaw) > 90)) ||
      (lngRaw !== null && lngRaw !== '' && (isNaN(Number(lngRaw)) || Number(lngRaw) < -180 || Number(lngRaw) > 180))
    ) {
      this.mostrarToast('Ingrese coordenadas dentro de un rango válido (-90..90 y -180..180) para consultar el clima.', 'danger');
      return;
    }

    const { lat: latConsulta, lng: lngConsulta } = this.obtenerCoordenadasParaClima();

    if (latRaw !== null && latRaw !== '' && lngRaw !== null && lngRaw !== '') {
      this.sincronizarMarcadorMapa(latConsulta, lngConsulta);
    }

    this.consultandoClima = true;
    this.errorClimaMensaje = '';
    this.climaActual = null;
    this.cdr.markForCheck();

    this.weatherService.consultarClimaPorCoordenadas(latConsulta, lngConsulta).subscribe({
      next: (datosClima) => {
        this.consultandoClima = false;
        this.climaActual = datosClima;
        this.climaConsultadoOIntentado = true;
        this.coordsClimaConsultado = { lat: latConsulta, lng: lngConsulta };
        this.persistirBorradorActual();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.consultandoClima = false;
        this.climaActual = null;
        this.climaConsultadoOIntentado = true;
        this.coordsClimaConsultado = { lat: latConsulta, lng: lngConsulta };
        this.errorClimaMensaje = err.message || 'Servicio meteorológico no disponible. Puede continuar con el registro.';
        this.persistirBorradorActual();
        this.cdr.markForCheck();
      }
    });
  }

  async guardarIncidencia() {
    this.form.markAllAsTouched();
    this.cdr.markForCheck();

    const valores = this.form.value;

    // Validación explícita R5/R6: Prioridad alta exige fotografía
    if (valores.prioridad === 'alta' && !valores.fotografia) {
      await this.mostrarAlertaValidacion(
        'Evidencia Fotográfica Obligatoria',
        this.permisoCamaraDenegado
          ? 'La incidencia tiene prioridad ALTA y usted denegó el permiso de cámara. Conceda el permiso o tome la fotografía para poder guardar este registro.'
          : 'Para incidencias de prioridad ALTA es obligatorio capturar una fotografía de evidencia antes de guardar.'
      );
      return;
    }

    // Validación explícita R7: Bache exige coordenadas
    if (valores.tipo === 'Bache' && (valores.latitud === null || valores.latitud === '' || valores.longitud === null || valores.longitud === '')) {
      await this.mostrarAlertaValidacion(
        'Ubicación Obligatoria para Baches',
        'Para incidencias de tipo Bache es obligatorio registrar las coordenadas. Obtenga su posición GPS, toque el mapa o ingrese latitud y longitud manualmente.'
      );
      return;
    }

    if (this.form.invalid) {
      this.mostrarToast('Revise los campos obligatorios marcados en rojo antes de enviar.', 'danger');
      return;
    }

    // R4: Si no se ha consultado el clima para las coordenadas actuales, consultarlo y mostrar el resultado antes de guardar
    if (!this.climaEsConsistenteConCoordenadas()) {
      this.consultarClimaAntesDeEnviar();
      return;
    }

    this.ejecutarEnvioRemoto();
  }

  private consultarClimaAntesDeEnviar() {
    const { lat: latConsulta, lng: lngConsulta } = this.obtenerCoordenadasParaClima();

    this.consultandoClima = true;
    this.errorClimaMensaje = '';
    this.cdr.markForCheck();

    this.weatherService.consultarClimaPorCoordenadas(latConsulta, lngConsulta).subscribe({
      next: async (clima) => {
        this.consultandoClima = false;
        this.climaActual = clima;
        this.climaConsultadoOIntentado = true;
        this.coordsClimaConsultado = { lat: latConsulta, lng: lngConsulta };
        this.persistirBorradorActual();
        this.cdr.markForCheck();

        const detalleClima =
          `Temperatura actual: ${clima.temperatura} °C\n` +
          `Precipitación (última hora): ${clima.precipitacionMm} mm\n` +
          `Condición: ${clima.condicion}` +
          (clima.alertaMantenimiento
            ? `\n\n⚠️ ADVERTENCIA: La precipitación supera los 5 mm (${clima.precipitacionMm} mm). Las condiciones podrían dificultar el mantenimiento, pero puede continuar con el registro.`
            : '');

        const alert = await this.alertCtrl.create({
          header: clima.alertaMantenimiento
            ? 'Advertencia Meteorológica (> 5 mm)'
            : 'Condiciones Meteorológicas del Lugar',
          message: detalleClima,
          backdropDismiss: false,
          buttons: [
            {
              text: 'Revisar formulario',
              role: 'cancel'
            },
            {
              text: 'Confirmar y Guardar',
              handler: () => {
                this.ejecutarEnvioRemoto();
              }
            }
          ]
        });
        await alert.present();
      },
      error: async (err) => {
        this.consultandoClima = false;
        this.climaActual = null;
        this.climaConsultadoOIntentado = true;
        this.coordsClimaConsultado = { lat: latConsulta, lng: lngConsulta };
        this.errorClimaMensaje = err.message || 'El servicio meteorológico no responde o no dispone de información.';
        this.persistirBorradorActual();
        this.cdr.markForCheck();

        const alert = await this.alertCtrl.create({
          header: 'Aviso del Servicio Meteorológico',
          message: `${this.errorClimaMensaje} ¿Desea continuar y guardar la incidencia de todas formas?`,
          backdropDismiss: false,
          buttons: [
            {
              text: 'Cancelar',
              role: 'cancel'
            },
            {
              text: 'Continuar y Guardar',
              handler: () => {
                this.ejecutarEnvioRemoto();
              }
            }
          ]
        });
        await alert.present();
      }
    });
  }

  private ejecutarEnvioRemoto() {
    this.guardando = true;
    this.cdr.markForCheck();
    const v = this.form.value;

    const nuevaIncidencia = {
      codigo: this.incidenciasService.generarCodigoUnico(),
      tipo: v.tipo as TipoIncidencia,
      descripcion: v.descripcion.trim(),
      direccion: v.direccion.trim(),
      sector: v.sector.trim(),
      fecha: new Date().toISOString(),
      estado: 'pendiente' as const,
      prioridad: v.prioridad as PrioridadIncidencia,
      fotografia: v.fotografia || null,
      latitud: v.latitud !== null && v.latitud !== '' ? Number(v.latitud) : null,
      longitud: v.longitud !== null && v.longitud !== '' ? Number(v.longitud) : null,
      observacion: null,
      clima: this.climaActual
    };

    this.incidenciasService.crearIncidencia(nuevaIncidencia).subscribe({
      next: async (creada) => {
        this.guardando = false;
        this.ignorarGuardadoBorrador = true;
        this.cdr.markForCheck();
        await this.storageService.limpiarBorrador();
        await this.mostrarToast(`Incidencia ${creada.codigo} registrada con éxito.`, 'success');
        this.router.navigate(['/tabs/tab2']);
      },
      error: async (err) => {
        this.guardando = false;
        this.cdr.markForCheck();
        await this.mostrarAlertaValidacion('Error de Conexión', err.message);
      }
    });
  }

  private resetearVista() {
    this.ignorarGuardadoBorrador = true;
    this.form.reset({
      tipo: 'Luminaria dañada',
      descripcion: '',
      direccion: '',
      sector: '',
      prioridad: 'media',
      fotografia: null,
      latitud: null,
      longitud: null
    });
    this.climaActual = null;
    this.errorClimaMensaje = '';
    this.climaConsultadoOIntentado = false;
    this.coordsClimaConsultado = null;
    this.ignorarGuardadoBorrador = false;
    this.cdr.markForCheck();
  }

  private async mostrarAlertaValidacion(titulo: string, mensaje: string) {
    const alert = await this.alertCtrl.create({
      header: titulo,
      message: mensaje,
      buttons: ['Entendido']
    });
    await alert.present();
  }

  private async mostrarToast(mensaje: string, color: 'success' | 'warning' | 'danger' | 'medium' | 'primary') {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 2800,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
