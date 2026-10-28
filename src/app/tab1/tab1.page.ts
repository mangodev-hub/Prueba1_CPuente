import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonCard,
  IonCardContent, IonGrid, IonRow, IonCol,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
  AlertController, ViewWillEnter
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircle, listOutline, bookmarkOutline, alertCircleOutline,
  timeOutline, checkmarkDoneOutline, flameOutline, documentTextOutline, refreshOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { IncidenciasService } from '../core/services/incidencias';
import { StorageService } from '../core/services/storage';
import { Incidencia } from '../core/models/incidencia.model';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonCard,
    IonCardContent, IonGrid, IonRow, IonCol,
    IonIcon, IonSpinner, IonRefresher, IonRefresherContent
  ],
})
export class Tab1Page implements OnInit, OnDestroy, ViewWillEnter {
  private incidenciasService = inject(IncidenciasService);
  private storageService = inject(StorageService);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  cargando = false;
  errorServidor = false;

  // Indicadores R10
  totalIncidencias = 0;
  pendientes = 0;
  enProceso = 0;
  resueltas = 0;
  prioridadAlta = 0;
  enSeguimientoLocal = 0;
  tieneBorradorPendiente = false;
  private alertaBorradorMostradaEnInicio = false;

  private subs = new Subscription();

  constructor() {
    addIcons({
      addCircle, listOutline, bookmarkOutline, alertCircleOutline,
      timeOutline, checkmarkDoneOutline, flameOutline, documentTextOutline, refreshOutline
    });
  }

  ngOnInit() {
    // Suscribirse a cambios en MockAPI para refrescar indicadores automáticamente (R10)
    this.subs.add(
      this.incidenciasService.cambios$.subscribe(() => this.cargarIndicadores())
    );

    // Suscribirse al contador de seguimiento local (R1)
    this.subs.add(
      this.storageService.seguidos$.subscribe(lista => {
        this.enSeguimientoLocal = lista.length;
        this.cdr.markForCheck();
      })
    );
  }

  async ionViewWillEnter() {
    this.cargarIndicadores();
    const borrador = await this.storageService.obtenerBorrador();
    this.tieneBorradorPendiente = !!borrador;
    this.cdr.markForCheck();

    // R8: Al volver a abrir la aplicación, ofrecer continuar o descartar el registro incompleto
    if (borrador && !this.alertaBorradorMostradaEnInicio) {
      this.alertaBorradorMostradaEnInicio = true;
      await this.ofrecerRecuperacionAlIniciar();
    }
  }

  private async ofrecerRecuperacionAlIniciar() {
    const alert = await this.alertCtrl.create({
      header: 'Registro incompleto detectado',
      message: 'Se encontró un registro de incidencia sin finalizar antes de cerrar la aplicación. ¿Desea continuar con los datos capturados o descartarlo?',
      backdropDismiss: false,
      buttons: [
        {
          text: 'Descartar',
          role: 'destructive',
          handler: async () => {
            await this.storageService.limpiarBorrador();
            this.tieneBorradorPendiente = false;
            this.cdr.markForCheck();
          }
        },
        {
          text: 'Continuar registro',
          handler: () => {
            this.router.navigate(['/registro'], {
              queryParams: { continuarBorrador: '1' }
            });
          }
        }
      ]
    });

    await alert.present();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  cargarIndicadores(event?: any) {
    this.cargando = true;
    this.errorServidor = false;
    this.cdr.markForCheck();

    this.incidenciasService.obtenerTodas().subscribe({
      next: (lista: Incidencia[]) => {
        this.cargando = false;
        this.totalIncidencias = lista.length;
        this.pendientes = lista.filter(i => i.estado === 'pendiente').length;
        this.enProceso = lista.filter(i => i.estado === 'en proceso').length;
        this.resueltas = lista.filter(i => i.estado === 'resuelta').length;
        this.prioridadAlta = lista.filter(i => i.prioridad === 'alta' && i.estado !== 'resuelta').length;
        this.cdr.markForCheck();
        event?.target?.complete();
      },
      error: () => {
        this.cargando = false;
        this.errorServidor = true;
        this.cdr.markForCheck();
        event?.target?.complete();
      }
    });
  }
}
