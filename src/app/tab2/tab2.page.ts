import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonBadge, IonSpinner, IonInfiniteScroll, IonInfiniteScrollContent,
  IonRefresher, IonRefresherContent, IonThumbnail, InfiniteScrollCustomEvent
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add, bookmark, bookmarkOutline, locationOutline, calendarOutline,
  alertCircleOutline, folderOpenOutline, chevronForward, arrowDownCircleOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { IncidenciasService } from '../core/services/incidencias';
import { StorageService } from '../core/services/storage';
import { Incidencia, EstadoIncidencia } from '../core/models/incidencia.model';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
    IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonBadge, IonSpinner, IonInfiniteScroll, IonInfiniteScrollContent,
    IonRefresher, IonRefresherContent, IonThumbnail
  ]
})
export class Tab2Page implements OnInit, OnDestroy {
  private incidenciasService = inject(IncidenciasService);
  private storageService = inject(StorageService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  incidencias: Incidencia[] = [];
  codigosSeguidos: string[] = [];

  // R3: Parámetros de paginación remota en grupos pequeños
  paginaActual = 1;
  readonly TAMANO_PAGINA = 5;
  finDeRegistros = false;

  cargandoInicial = false;
  cargandoMas = false;
  errorConsulta = '';

  private subs = new Subscription();

  constructor() {
    addIcons({
      add, bookmark, bookmarkOutline, locationOutline, calendarOutline,
      alertCircleOutline, folderOpenOutline, chevronForward, arrowDownCircleOutline
    });
  }

  ngOnInit() {
    this.reiniciarYCargar();

    // Sincronizar cambios cuando se registra o actualiza una incidencia (R10)
    this.subs.add(
      this.incidenciasService.cambios$.subscribe(() => {
        this.reiniciarYCargar();
      })
    );

    // Sincronizar íconos de seguimiento local (R1)
    this.subs.add(
      this.storageService.seguidos$.subscribe(codigos => {
        this.codigosSeguidos = codigos;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  reiniciarYCargar(refresherEvent?: any) {
    this.paginaActual = 1;
    this.finDeRegistros = false;
    this.cargandoMas = false;
    this.incidencias = [];
    this.errorConsulta = '';
    this.cargandoInicial = true;
    this.cdr.markForCheck();

    this.incidenciasService.obtenerPaginadas(this.paginaActual, this.TAMANO_PAGINA).subscribe({
      next: (bloque) => {
        this.cargandoInicial = false;
        this.incidencias = bloque;
        this.paginaActual++;

        if (bloque.length < this.TAMANO_PAGINA) {
          this.finDeRegistros = true;
        }
        this.cdr.markForCheck();
        refresherEvent?.target?.complete();
      },
      error: (err) => {
        this.cargandoInicial = false;
        this.errorConsulta = err.message || 'Fallo al consultar el servicio de oficina.';
        this.cdr.markForCheck();
        refresherEvent?.target?.complete();
      }
    });
  }

  /**
   * R3: Carga el siguiente grupo de 5 registros desde MockAPI conforme avanza al final.
   * Si ya se agotaron o hay una petición en curso, no realiza más peticiones HTTP.
   */
  cargarSiguientePagina(event?: InfiniteScrollCustomEvent) {
    if (this.finDeRegistros || this.cargandoMas || this.cargandoInicial) {
      event?.target?.complete();
      return;
    }

    this.cargandoMas = true;
    this.cdr.markForCheck();

    this.incidenciasService.obtenerPaginadas(this.paginaActual, this.TAMANO_PAGINA).subscribe({
      next: (nuevas) => {
        this.cargandoMas = false;
        if (nuevas.length === 0) {
          this.finDeRegistros = true;
        } else {
          // Evitar duplicados por ID al concatenar el nuevo grupo
          const idsExistentes = new Set(this.incidencias.map(i => i.id));
          const filtradas = nuevas.filter(n => !n.id || !idsExistentes.has(n.id));
          this.incidencias = [...this.incidencias, ...filtradas];
          this.paginaActual++;

          if (nuevas.length < this.TAMANO_PAGINA) {
            this.finDeRegistros = true;
          }
        }
        this.cdr.markForCheck();
        event?.target?.complete();
      },
      error: (err) => {
        this.cargandoMas = false;
        this.errorConsulta = err.message || 'Error al cargar más páginas.';
        this.cdr.markForCheck();
        event?.target?.complete();
      }
    });
  }

  esSeguida(codigo: string): boolean {
    return this.codigosSeguidos.includes(codigo);
  }

  abrirDetalle(id?: string) {
    if (id) {
      this.router.navigate(['/detalle', id]);
    }
  }

  async toggleSeguimiento(event: Event, codigo: string) {
    event.stopPropagation();
    event.preventDefault();
    await this.storageService.toggleSeguimiento(codigo);
    this.cdr.markForCheck();
  }

  colorEstado(estado: EstadoIncidencia): string {
    if (estado === 'pendiente') return 'danger';
    if (estado === 'en proceso') return 'warning';
    return 'success';
  }
}
