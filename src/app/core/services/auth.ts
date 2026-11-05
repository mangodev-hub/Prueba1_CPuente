import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  getAuth,
  Auth,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private app: FirebaseApp;
  private auth: Auth;

  private usuarioSubject = new BehaviorSubject<User | null>(null);
  usuario$ = this.usuarioSubject.asObservable();

  private inicializadoPromise: Promise<User | null>;

  constructor() {
    this.app = initializeApp(environment.firebase);
    this.auth = getAuth(this.app);

    // Inicializar Firebase Analytics si el entorno navegador lo soporta
    isSupported().then(soportado => {
      if (soportado) {
        getAnalytics(this.app);
      }
    }).catch(() => {});

    this.inicializadoPromise = new Promise(resolve => {
      let resuelto = false;
      onAuthStateChanged(this.auth, user => {
        this.usuarioSubject.next(user);
        if (!resuelto) {
          resuelto = true;
          resolve(user);
        }
      });
    });
  }

  get usuarioActual(): User | null {
    return this.auth.currentUser || this.usuarioSubject.value;
  }

  async esperarEstadoAuth(): Promise<User | null> {
    if (this.auth.currentUser) {
      return this.auth.currentUser;
    }
    return this.inicializadoPromise;
  }

  async iniciarSesion(correo: string, contrasena: string): Promise<User> {
    const credencial = await signInWithEmailAndPassword(
      this.auth,
      correo.trim(),
      contrasena
    );
    this.usuarioSubject.next(credencial.user);
    return credencial.user;
  }

  async registrarCuenta(correo: string, contrasena: string): Promise<User> {
    const credencial = await createUserWithEmailAndPassword(
      this.auth,
      correo.trim(),
      contrasena
    );
    this.usuarioSubject.next(credencial.user);
    return credencial.user;
  }

  async recuperarContrasena(correo: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, correo.trim());
  }

  async cerrarSesion(): Promise<void> {
    await signOut(this.auth);
    this.usuarioSubject.next(null);
  }

  traducirErrorFirebase(codigo?: string): string {
    switch (codigo) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Correo electrónico o contraseña incorrectos. Verifica tus datos.';
      case 'auth/invalid-email':
        return 'El formato del correo electrónico no es válido.';
      case 'auth/email-already-in-use':
        return 'Este correo ya está registrado. Inicia sesión con tu contraseña.';
      case 'auth/weak-password':
        return 'La contraseña debe tener al menos 6 caracteres.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos fallidos. Espera unos minutos antes de reintentar.';
      case 'auth/network-request-failed':
        return 'Error de conexión a internet. Verifica tu red e intenta nuevamente.';
      default:
        return 'No se pudo completar la autenticación. Verifica tus credenciales.';
    }
  }
}

