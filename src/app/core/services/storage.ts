import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';
import { PrioridadIncidencia, TipoIncidencia, ClimaInfo } from '../models/incidencia.model';

export interface BorradorIncidencia {
  tipo: TipoIncidencia;
  descripcion: string;
  direccion: string;
  sector: string;
  prioridad: PrioridadIncidencia;
  fotografia?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  clima?: ClimaInfo | null;
  fechaGuardado: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly FOLLOW_KEY = 'urbaninspect_seguimiento_codigos';
  private readonly DRAFT_KEY = 'urbaninspect_borrador_formulario';

  // Flujo reactivo de códigos en seguimiento (R1)
  private seguidosSubject = new BehaviorSubject<string[]>([]);
  seguidos$ = this.seguidosSubject.asObservable();

  constructor() {
    this.cargarSeguidosIniciales();
  }

 
  async cargarSeguidosIniciales(): Promise<void> {
    const { value } = await Preferences.get({ key: this.FOLLOW_KEY });
    if (value) {
      try {
        const lista: string[] = JSON.parse(value);
        this.seguidosSubject.next(lista);
      } catch {
        this.seguidosSubject.next([]);
      }
    }
  }

  
  async toggleSeguimiento(codigo: string): Promise<boolean> {
    const actuales = this.seguidosSubject.value;
    const existe = actuales.includes(codigo);

    const actualizados = existe
      ? actuales.filter(c => c !== codigo)
      : [...actuales, codigo];

    await Preferences.set({
      key: this.FOLLOW_KEY,
      value: JSON.stringify(actualizados)
    });

    this.seguidosSubject.next(actualizados);
    return !existe; 
  }

  esSeguido(codigo: string): boolean {
    return this.seguidosSubject.value.includes(codigo);
  }

  obtenerCodigosSeguidos(): string[] {
    return this.seguidosSubject.value;
  }

  

  async guardarBorrador(borrador: BorradorIncidencia): Promise<void> {
    await Preferences.set({
      key: this.DRAFT_KEY,
      value: JSON.stringify(borrador)
    });
  }

  async obtenerBorrador(): Promise<BorradorIncidencia | null> {
    const { value } = await Preferences.get({ key: this.DRAFT_KEY });
    if (!value) return null;
    try {
      return JSON.parse(value) as BorradorIncidencia;
    } catch {
      return null;
    }
  }

  async limpiarBorrador(): Promise<void> {
    await Preferences.remove({ key: this.DRAFT_KEY });
  }
}
