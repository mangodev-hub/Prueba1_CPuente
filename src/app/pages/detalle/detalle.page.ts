import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonBadge, IonButton, IonIcon, IonItem, IonSelect, IonSelectOption,
  IonTextarea, IonSpinner, ToastController, AlertController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookmark, bookmarkOutline, locationOutline, calendarOutline,
  thermometerOutline, rainyOutline, checkmarkDoneCircle, lockClosed, alertCircle
} from 'ionicons/icons';
import * as L from 'leaflet';

import { IncidenciasService } from '../../core/services/incidencias';
import { StorageService } from '../../core/services/storage';
import { Incidencia, EstadoIncidencia } from '../../core/models/incidencia.model';

@Component({
  selector: 'app-detalle',
  templateUrl: './detalle.page.html',
  styleUrls: ['./detalle.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonBadge, IonButton, IonIcon, IonItem, IonSelect, IonSelectOption,
    IonTextarea, IonSpinner
  ]
})
export class DetallePage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private incidenciasService = inject(IncidenciasService);
  private storageService = inject(StorageService);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);

  incidencia: Incidencia | null = null;
  cargando = true;
  errorCarga = '';

  // Estado de seguimiento local
  enSeguimiento = false;

  // Control de transición de estado
  nuevoEstadoSeleccionado: EstadoIncidencia | '' = '';
  observacionInput = '';
  actualizando = false;

  // Mapa Leaflet de solo lectura
  private map: L.Map | null = null;

  constructor() {
    addIcons({
      bookmark, bookmarkOutline, locationOutline, calendarOutline,
      thermometerOutline, rainyOutline, checkmarkDoneCircle, lockClosed, alertCircle
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.cargarDetalle(id);
    } else {
      this.errorCarga = 'Identificador de incidencia no válido.';
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  cargarDetalle(id: string) {
    this.cargando = true;
    this.errorCarga = '';
    this.cdr.markForCheck();

    this.incidenciasService.obtenerPorId(id).subscribe({
      next: (data) => {
        this.incidencia = data;
        this.cargando = false;
        this.enSeguimiento = this.storageService.esSeguido(data.codigo);

        if (data.estado === 'pendiente') {
          this.nuevoEstadoSeleccionado = 'en proceso';
        } else if (data.estado === 'en proceso') {
          this.nuevoEstadoSeleccionado = 'resuelta';
        } else {
          this.nuevoEstadoSeleccionado = '';
        }

        this.cdr.markForCheck();

        if (data.latitud != null && data.longitud != null) {
          setTimeout(() => this.renderizarMapaDetalle(data.latitud!, data.longitud!), 300);
        }
      },
      error: (err) => {
        this.cargando = false;
        this.errorCarga = err.message || 'Error al cargar el detalle de la incidencia.';
        this.cdr.markForCheck();
      }
    });
  }

  get estadosPermitidos(): EstadoIncidencia[] {
    if (!this.incidencia) return [];
    if (this.incidencia.estado === 'pendiente') {
      return ['en proceso', 'resuelta'];
    }
    if (this.incidencia.estado === 'en proceso') {
      return ['resuelta'];
    }
    return [];
  }

  async toggleSeguimientoLocal() {
    if (!this.incidencia) return;
    this.enSeguimiento = await this.storageService.toggleSeguimiento(this.incidencia.codigo);
    this.cdr.markForCheck();
    const msg = this.enSeguimiento
      ? `Incidencia ${this.incidencia.codigo} agregada a tu seguimiento local.`
      : `Incidencia ${this.incidencia.codigo} retirada del seguimiento local.`;
    this.mostrarToast(msg, this.enSeguimiento ? 'warning' : 'medium');
  }

  async guardarCambioEstado() {
    if (!this.incidencia || !this.nuevoEstadoSeleccionado) return;

    if (this.incidencia.estado === 'resuelta') {
      this.mostrarAlerta('Acción no permitida', 'Una incidencia resuelta no puede regresar a pendiente ni a en proceso.');
      return;
    }

    if (this.nuevoEstadoSeleccionado === 'resuelta' && !this.observacionInput.trim()) {
      this.mostrarAlerta(
        'Observación Obligatoria',
        'Para marcar una incidencia como RESUELTA es obligatorio ingresar una observación técnica de cierre.'
      );
      return;
    }

    this.actualizando = true;
    this.cdr.markForCheck();

    this.incidenciasService.actualizarEstado(
      this.incidencia,
      this.nuevoEstadoSeleccionado,
      this.observacionInput
    ).subscribe({
      next: (actualizada) => {
        this.actualizando = false;
        this.incidencia = actualizada;
        this.observacionInput = '';
        this.nuevoEstadoSeleccionado = actualizada.estado === 'en proceso' ? 'resuelta' : '';
        this.cdr.markForCheck();
        this.mostrarToast(`Estado actualizado a "${actualizada.estado.toUpperCase()}" en el servidor.`, 'success');
      },
      error: (err) => {
        this.actualizando = false;
        this.cdr.markForCheck();
        this.mostrarAlerta('Error al actualizar', err.message);
      }
    });
  }

  private renderizarMapaDetalle(lat: number, lng: number) {
    if (this.map) {
      this.map.remove();
    }

    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41]
    });

    this.map = L.map('mapa-detalle').setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    L.marker([lat, lng], { icon: defaultIcon })
      .addTo(this.map)
      .bindPopup(`<b>${this.incidencia?.codigo}</b><br>${this.incidencia?.tipo}`)
      .openPopup();

    setTimeout(() => this.map?.invalidateSize(), 250);
  }

  colorEstado(estado: EstadoIncidencia): string {
    if (estado === 'pendiente') return 'danger';
    if (estado === 'en proceso') return 'warning';
    return 'success';
  }

  colorPrioridad(prioridad: string): string {
    if (prioridad === 'alta') return 'danger';
    if (prioridad === 'media') return 'warning';
    return 'primary';
  }

  private async mostrarToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color, position: 'bottom' });
    await toast.present();
  }

  private async mostrarAlerta(header: string, message: string) {
    const alert = await this.alertCtrl.create({ header, message, buttons: ['Aceptar'] });
    await alert.present();
  }
}

