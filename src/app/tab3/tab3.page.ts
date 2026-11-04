import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardHeader,
  IonCardTitle, IonCardSubtitle, IonCardContent, IonBadge, IonButton,
  IonIcon, IonSpinner, IonThumbnail, ToastController, AlertController, ViewWillEnter
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookmark, trashOutline, bookmarksOutline, locationOutline,
  calendarOutline, cloudDoneOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { IncidenciasService } from '../core/services/incidencias';
import { StorageService } from '../core/services/storage';
import { CloudinaryService } from '../core/services/cloudinary';
import { Incidencia, EstadoIncidencia } from '../core/models/incidencia.model';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardHeader,
    IonCardTitle, IonCardSubtitle, IonCardContent, IonBadge, IonButton,
    IonIcon, IonSpinner, IonThumbnail
  ],
})
export class Tab3Page implements OnInit, OnDestroy, ViewWillEnter {
  private incidenciasService = inject(IncidenciasService);
  private storageService = inject(StorageService);
  readonly cloudinaryService = inject(CloudinaryService);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  todasLasIncidencias: Incidencia[] = [];
  incidenciasSeguidas: Incidencia[] = [];
  codigosLocales: string[] = [];
  filtroEstado: 'todos' | EstadoIncidencia = 'todos';

  cargando = false;
  private subs = new Subscription();

  constructor() {
    addIcons({
      bookmark, trashOutline, bookmarksOutline, locationOutline,
      calendarOutline, cloudDoneOutline
    });
  }

  ngOnInit() {
    // Escuchar en vivo los cambios del seguimiento local (R1)
    this.subs.add(
      this.storageService.seguidos$.subscribe(codigos => {
        this.codigosLocales = codigos;
        this.filtrarSeguidas();
      })
    );

    // Escuchar si alguna incidencia cambió de estado en el servidor
    this.subs.add(
      this.incidenciasService.cambios$.subscribe(() => {
        this.sincronizarCatalogo();
      })
    );
  }

  ionViewWillEnter() {
    this.sincronizarCatalogo();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  get seguidasFiltradas(): Incidencia[] {
    if (this.filtroEstado === 'todos') {
      return this.incidenciasSeguidas;
    }
    return this.incidenciasSeguidas.filter(i => i.estado === this.filtroEstado);
  }

  seleccionarFiltro(estado: 'todos' | EstadoIncidencia) {
    this.filtroEstado = estado;
    this.cdr.markForCheck();
  }

  sincronizarCatalogo() {
    this.cargando = true;
    this.cdr.markForCheck();

    this.incidenciasService.obtenerTodas().subscribe({
      next: (lista) => {
        this.cargando = false;
        this.todasLasIncidencias = lista;
        this.filtrarSeguidas();
      },
      error: () => {
        this.cargando = false;
        this.filtrarSeguidas();
      }
    });
  }

  private filtrarSeguidas() {
    this.incidenciasSeguidas = this.todasLasIncidencias.filter(inc =>
      this.codigosLocales.includes(inc.codigo)
    );
    this.cdr.markForCheck();
  }

  abrirDetalle(id?: string) {
    if (id) {
      this.router.navigate(['/detalle', id]);
    }
  }

  /**
   * R1: Al desmarcar una incidencia, muestra confirmación y desaparece inmediatamente
   * del seguimiento sin navegar al detalle ni modificar la API.
   */
  async quitarDeSeguimiento(event: Event, codigo: string) {
    event.stopPropagation();
    event.preventDefault();

    const alert = await this.alertCtrl.create({
      header: 'Desmarcar seguimiento',
      message: `¿Deseas retirar la incidencia ${codigo} de tu lista de seguimiento local?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Sí, retirar',
          role: 'destructive',
          handler: async () => {
            await this.storageService.toggleSeguimiento(codigo);
            this.cdr.markForCheck();

            const toast = await this.toastCtrl.create({
              message: `Incidencia ${codigo} retirada del seguimiento local.`,
              duration: 2200,
              color: 'medium',
              position: 'bottom'
            });
            await toast.present();
          }
        }
      ]
    });

    await alert.present();
  }

  colorEstado(estado: EstadoIncidencia): string {
    if (estado === 'pendiente') return 'danger';
    if (estado === 'en proceso') return 'warning';
    return 'success';
  }
}
