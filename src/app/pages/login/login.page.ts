import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
  IonCardContent, IonItem, IonInput, IonButton, IonIcon, IonSpinner,
  IonNote, ToastController, AlertController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  flameOutline, shieldCheckmarkOutline, mailOutline, lockClosedOutline,
  eyeOutline, eyeOffOutline, logInOutline, personAddOutline, alertCircle,
  keyOutline
} from 'ionicons/icons';

import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
    IonCardContent, IonItem, IonInput, IonButton, IonIcon, IonSpinner,
    IonNote
  ]
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);

  modo: 'login' | 'registro' = 'login';
  mostrarPassword = false;
  procesando = false;
  mensajeError = '';

  form: FormGroup = this.fb.group({
    correo: ['', [Validators.required, Validators.email]],
    contrasena: ['', [Validators.required, Validators.minLength(6)]]
  });

  constructor() {
    addIcons({
      flameOutline, shieldCheckmarkOutline, mailOutline, lockClosedOutline,
      eyeOutline, eyeOffOutline, logInOutline, personAddOutline, alertCircle,
      keyOutline
    });
  }

  cambiarModo(nuevoModo: 'login' | 'registro') {
    this.modo = nuevoModo;
    this.mensajeError = '';
    this.cdr.markForCheck();
  }

  toggleMostrarPassword() {
    this.mostrarPassword = !this.mostrarPassword;
    this.cdr.markForCheck();
  }

  async enviarFormulario() {
    this.form.markAllAsTouched();
    this.mensajeError = '';
    this.cdr.markForCheck();

    if (this.form.invalid) {
      this.mensajeError = 'Por favor ingresa un correo válido y una contraseña de al menos 6 caracteres.';
      this.cdr.markForCheck();
      return;
    }

    const { correo, contrasena } = this.form.value;
    this.procesando = true;
    this.cdr.markForCheck();

    try {
      if (this.modo === 'login') {
        const user = await this.authService.iniciarSesion(correo, contrasena);
        this.procesando = false;
        this.cdr.markForCheck();
        await this.mostrarToast(`Bienvenido, ${user.email}`, 'success');
        await this.router.navigateByUrl('/tabs/tab1', { replaceUrl: true });
      } else {
        const user = await this.authService.registrarCuenta(correo, contrasena);
        this.procesando = false;
        this.cdr.markForCheck();
        await this.mostrarToast(`Cuenta de inspector creada: ${user.email}`, 'success');
        await this.router.navigateByUrl('/tabs/tab1', { replaceUrl: true });
      }
    } catch (err: any) {
      this.procesando = false;
      this.mensajeError = this.authService.traducirErrorFirebase(err?.code);
      this.cdr.markForCheck();
    }
  }

  async olvideMiContrasena() {
    const correoActual = this.form.get('correo')?.value || '';
    const alert = await this.alertCtrl.create({
      header: 'Recuperar Contraseña',
      message: 'Ingresa tu correo institucional registrado para enviarte un enlace de restablecimiento:',
      inputs: [
        {
          name: 'correo',
          type: 'email',
          placeholder: 'inspector@quito.gob.ec',
          value: correoActual
        }
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Enviar enlace',
          handler: async (data) => {
            if (!data.correo || !data.correo.includes('@')) {
              this.mostrarToast('Ingresa un correo electrónico válido.', 'warning');
              return false;
            }
            try {
              await this.authService.recuperarContrasena(data.correo);
              this.mostrarToast('Enlace de recuperación enviado a tu correo.', 'success');
            } catch (err: any) {
              this.mostrarToast(this.authService.traducirErrorFirebase(err?.code), 'danger');
            }
            return true;
          }
        }
      ]
    });

    await alert.present();
  }

  private async mostrarToast(message: string, color: 'success' | 'warning' | 'danger' | 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2600,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}

