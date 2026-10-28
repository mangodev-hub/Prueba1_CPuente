import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Incidencia, EstadoIncidencia } from '../models/incidencia.model';

@Injectable({
  providedIn: 'root'
})
export class IncidenciasService {
  private http = inject(HttpClient);

  // URL ENDPOINT REAL DE MOCKAPI
  private readonly API_URL = 'https://6ae169b1be3bc8fead9877ed.mockapi.io/INCIDENCIA';

  private cambiosSubject = new Subject<void>();
  cambios$ = this.cambiosSubject.asObservable();

  obtenerPaginadas(page: number = 1, limit: number = 5): Observable<Incidencia[]> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('sortBy', 'fecha')
      .set('order', 'desc');

    return this.http.get<Incidencia[]>(this.API_URL, { params }).pipe(
      catchError(err => {
        if (err?.status === 404 && page > 1) {
          return of([]);
        }
        console.error('Error al consultar incidencias paginadas:', err);
        return throwError(() => new Error('No se pudo conectar con el servicio de oficina.'));
      })
    );
  }

  obtenerTodas(): Observable<Incidencia[]> {
    const params = new HttpParams()
      .set('sortBy', 'fecha')
      .set('order', 'desc');

    return this.http.get<Incidencia[]>(this.API_URL, { params }).pipe(
      catchError(err => {
        console.error('Error al obtener el total de incidencias:', err);
        return throwError(() => new Error('Error al cargar datos del servidor.'));
      })
    );
  }

  obtenerPorId(id: string): Observable<Incidencia> {
    return this.http.get<Incidencia>(`${this.API_URL}/${id}`).pipe(
      catchError(err => {
        console.error(`Error al consultar incidencia ${id}:`, err);
        return throwError(() => new Error('No se pudo cargar el detalle de la incidencia.'));
      })
    );
  }

  crearIncidencia(nueva: Omit<Incidencia, 'id'>): Observable<Incidencia> {
    return this.http.post<Incidencia>(this.API_URL, nueva).pipe(
      tap(() => this.cambiosSubject.next()),
      catchError(err => {
        console.error('Error al registrar incidencia:', err);
        return throwError(() => new Error('No se pudo guardar la incidencia en el servidor.'));
      })
    );
  }

  actualizarEstado(
    incidenciaActual: Incidencia,
    nuevoEstado: EstadoIncidencia,
    observacion?: string
  ): Observable<Incidencia> {
    if (!incidenciaActual.id) {
      return throwError(() => new Error('La incidencia no tiene un ID válido.'));
    }

    if (incidenciaActual.estado === 'resuelta') {
      return throwError(() => new Error('Una incidencia resuelta no puede cambiar de estado.'));
    }

    if (incidenciaActual.estado === 'en proceso' && nuevoEstado !== 'resuelta') {
      return throwError(() => new Error('Una incidencia en proceso solo puede cambiar a resuelta.'));
    }

    if (nuevoEstado === 'resuelta' && (!observacion || !observacion.trim())) {
      return throwError(() => new Error('Es obligatorio ingresar una observación para resolver la incidencia.'));
    }

    const payload: Partial<Incidencia> = {
      estado: nuevoEstado,
      observacion: nuevoEstado === 'resuelta' ? observacion!.trim() : (incidenciaActual.observacion || null)
    };

    return this.http.put<Incidencia>(`${this.API_URL}/${incidenciaActual.id}`, {
      ...incidenciaActual,
      ...payload
    }).pipe(
      tap(() => this.cambiosSubject.next()),
      catchError(err => {
        console.error('Error al actualizar estado:', err);
        return throwError(() => new Error('No se pudo actualizar el estado en el servicio de oficina.'));
      })
    );
  }

  generarCodigoUnico(): string {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `URB-2026-${random}`;
  }
}
