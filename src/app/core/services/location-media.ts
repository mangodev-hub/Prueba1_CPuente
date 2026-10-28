import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface ResultadoFoto {
  estado: 'ok' | 'cancelado' | 'permiso_denegado' | 'error';
  dataUrl?: string;
  mensaje?: string;
}

export interface ResultadoUbicacion {
  estado: 'ok' | 'permiso_denegado' | 'error';
  latitud?: number;
  longitud?: number;
  mensaje?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocationMediaService {

 

  async capturarFotografia(): Promise<ResultadoFoto> {
    try {
      
      if (Capacitor.isNativePlatform()) {
        const estadoPermisos = await Camera.checkPermissions();
        if (estadoPermisos.camera === 'denied') {
          const solicitud = await Camera.requestPermissions({ permissions: ['camera'] });
          if (solicitud.camera === 'denied') {
            return {
              estado: 'permiso_denegado',
              mensaje: 'Permiso de cámara denegado. Habilítelo en los ajustes de Android para adjuntar evidencia obligatoria.'
            };
          }
        }
      }

     
      const photo = await Camera.getPhoto({
        quality: 60,
        width: 600,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt, 
        promptLabelHeader: 'Evidencia Fotográfica',
        promptLabelPhoto: 'Elegir de la galería',
        promptLabelPicture: 'Tomar fotografía'
      });

      if (!photo || !photo.dataUrl) {
        return { estado: 'cancelado' };
      }

     
      const comprimida = await this.comprimirBase64(photo.dataUrl, 600, 0.5);

      return {
        estado: 'ok',
        dataUrl: comprimida
      };

    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();

      // Si el usuario cierra la cámara sin tomar foto (R6: conservar demás datos intactos)
      if (msg.includes('cancel') || msg.includes('user cancelled')) {
        return { estado: 'cancelado' };
      }

      
      if (msg.includes('permission') || msg.includes('denied')) {
        return {
          estado: 'permiso_denegado',
          mensaje: 'Se denegó el acceso a la cámara. No es posible capturar la evidencia fotográfica.'
        };
      }

      return {
        estado: 'error',
        mensaje: 'No se pudo acceder a la cámara del dispositivo.'
      };
    }
  }

  
  private comprimirBase64(dataUrl: string, maxWidth: number, quality: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

 

  async obtenerCoordenadasActuales(): Promise<ResultadoUbicacion> {
    try {
      if (Capacitor.isNativePlatform()) {
        const permisos = await Geolocation.checkPermissions();
        if (permisos.location === 'denied' || permisos.location === 'prompt') {
          const solicitud = await Geolocation.requestPermissions();
          if (solicitud.location === 'denied') {
            return {
              estado: 'permiso_denegado',
              mensaje: 'Permiso de ubicación denegado. Puede ingresar las coordenadas manualmente o tocar el mapa.'
            };
          }
        }
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 8000
      });

      return {
        estado: 'ok',
        latitud: Number(position.coords.latitude.toFixed(6)),
        longitud: Number(position.coords.longitude.toFixed(6))
      };

    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('denied') || msg.includes('permission')) {
        return {
          estado: 'permiso_denegado',
          mensaje: 'Sin permiso de GPS. Ingrese coordenadas manuales válidas para continuar.'
        };
      }

      return {
        estado: 'error',
        mensaje: 'No se pudo obtener la señal GPS. Puede ingresar las coordenadas manualmente.'
      };
    }
  }
}