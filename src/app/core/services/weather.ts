import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { ClimaInfo } from '../models/incidencia.model';

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private http = inject(HttpClient);
  private readonly OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

 
  consultarClimaPorCoordenadas(latitud: number, longitud: number): Observable<ClimaInfo> {
    const params = new HttpParams()
      .set('latitude', latitud.toString())
      .set('longitude', longitud.toString())
      .set('current', 'temperature_2m,precipitation,weather_code')
      .set('hourly', 'precipitation')
      .set('past_hours', '1')
      .set('forecast_hours', '1')
      .set('timezone', 'auto');

    return this.http.get<any>(this.OPEN_METEO_URL, { params }).pipe(
      timeout(8000),
      map(response => {
        if (!response || !response.current) {
          throw new Error('Respuesta meteorológica incompleta');
        }

        const temp = Number(response.current.temperature_2m ?? 0);

        
        let precipitacionUltimaHora = Number(response.current.precipitation ?? 0);
        if (response.hourly?.precipitation?.length > 0) {
          const valoresHora: number[] = response.hourly.precipitation;
          const maxHora = Math.max(...valoresHora, precipitacionUltimaHora);
          precipitacionUltimaHora > Number(maxHora.toFixed(2));
        }

        const codigoClima = Number(response.current.weather_code ?? 0);

        return {
          temperatura: temp,
          precipitacionMm: precipitacionUltimaHora,
          condicion: this.traducirCodigoWMO(codigoClima),
          alertaMantenimiento: precipitacionUltimaHora > 5 
        };
      }),
      catchError(err => {
        console.error('Fallo al consultar el servicio meteorológico:', err);
        return throwError(() => new Error(
          'El servicio meteorológico no responde o no dispone de información en este momento. Puede continuar con el registro.'
        ));
      })
    );
  }


  private traducirCodigoWMO(code: number): string {
    if (code === 0) return 'Cielo despejado';
    if (code === 1 || code === 2) return 'Parcialmente nublado';
    if (code === 3) return 'Nublado';
    if (code === 45 || code === 48) return 'Neblina';
    if (code >= 51 && code <= 57) return 'Llovizna ligera';
    if (code >= 61 && code <= 65) return 'Lluvia moderada a fuerte';
    if (code >= 66 && code <= 67) return 'Lluvia fría';
    if (code >= 80 && code <= 82) return 'Aguacero / Chubascos';
    if (code >= 95 && code <= 99) return 'Tormenta eléctrica';
    return 'Condición variable';
  }
}