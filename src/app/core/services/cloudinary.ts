import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RespuestaCloudinary {
  secure_url: string;
  public_id: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
}

export interface ResultadoSubidaCloudinary {
  exito: boolean;
  url?: string;
  publicId?: string;
  formato?: string;
  tamanoKb?: number;
  mensajeError?: string;
  requiereConfiguracion?: boolean;
}

const STORAGE_SECRET_KEY = 'urban_inspect_cloudinary_secret';
const STORAGE_PRESET_KEY = 'urban_inspect_cloudinary_preset';

@Injectable({
  providedIn: 'root'
})
export class CloudinaryService {
  private http = inject(HttpClient);

  get cloudName(): string {
    return environment.cloudinary.cloudName || 'dsebmsrno';
  }

  get apiKey(): string {
    return environment.cloudinary.apiKey || '557895777321696';
  }

  get apiSecret(): string {
    return (
      environment.cloudinary.apiSecret?.trim() ||
      localStorage.getItem(STORAGE_SECRET_KEY)?.trim() ||
      ''
    );
  }

  get uploadPreset(): string {
    return (
      localStorage.getItem(STORAGE_PRESET_KEY)?.trim() ||
      environment.cloudinary.uploadPreset?.trim() ||
      'fotos'
    );
  }

  get folder(): string {
    return environment.cloudinary.folder || 'urban_inspect';
  }

  guardarConfiguracionLocal(apiSecret: string, uploadPreset?: string): void {
    if (apiSecret.trim()) {
      localStorage.setItem(STORAGE_SECRET_KEY, apiSecret.trim());
    }
    if (uploadPreset && uploadPreset.trim()) {
      localStorage.setItem(STORAGE_PRESET_KEY, uploadPreset.trim());
    }
  }

  tieneCredencialesCompletas(): boolean {
    return Boolean(this.cloudName && (this.apiSecret || this.uploadPreset));
  }

  esUrlCloudinary(valor?: string | null): boolean {
    if (!valor) return false;
    return valor.startsWith('https://res.cloudinary.com/') || valor.startsWith('http://res.cloudinary.com/');
  }

  /**
   * Optimiza dinámicamente una URL de Cloudinary inyectando transformaciones f_auto,q_auto
   */
  optimizarUrl(url?: string | null, ancho?: number): string {
    if (!url) return '';
    if (!this.esUrlCloudinary(url)) return url;

    const transformacion = ancho ? `f_auto,q_auto,w_${ancho},c_limit` : 'f_auto,q_auto';
    if (url.includes('/image/upload/') && !url.includes('/image/upload/f_auto')) {
      return url.replace('/image/upload/', `/image/upload/${transformacion}/`);
    }
    return url;
  }

  /**
   * Sube una imagen en Base64 (DataUrl) a Cloudinary.
   * Soporta subida firmada (Signed Upload con API Key + API Secret)
   * y subida no firmada (Unsigned Upload con Upload Preset).
   */
  async subirFotografia(dataUrl: string): Promise<ResultadoSubidaCloudinary> {
    const endpoint = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;

    // 1. Si cuenta con API Secret, realizar subida firmada (Signed Upload SHA-1)
    if (this.apiSecret) {
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const cadenaAFirmar = `folder=${this.folder}&timestamp=${timestamp}${this.apiSecret}`;
        const signature = this.sha1Hex(cadenaAFirmar);

        const formData = new FormData();
        formData.append('file', dataUrl);
        formData.append('api_key', this.apiKey);
        formData.append('timestamp', timestamp);
        formData.append('folder', this.folder);
        formData.append('signature', signature);

        const respuesta = await firstValueFrom(
          this.http.post<RespuestaCloudinary>(endpoint, formData)
        );

        return {
          exito: true,
          url: respuesta.secure_url,
          publicId: respuesta.public_id,
          formato: respuesta.format,
          tamanoKb: Math.round((respuesta.bytes || 0) / 1024)
        };
      } catch (err: any) {
        const msg = err?.error?.error?.message || 'Error en subida firmada a Cloudinary.';
        return {
          exito: false,
          mensajeError: `Cloudinary (${this.cloudName}): ${msg}`,
          requiereConfiguracion: msg.toLowerCase().includes('invalid signature')
        };
      }
    }

    // 2. Si no hay API Secret, intentar con Upload Preset (Unsigned Upload)
    const presetsAProbar = Array.from(new Set([this.uploadPreset, 'fotos', 'ml_default'].filter(Boolean)));

    for (const preset of presetsAProbar) {
      try {
        const formData = new FormData();
        formData.append('file', dataUrl);
        formData.append('upload_preset', preset);
        formData.append('folder', this.folder);

        const respuesta = await firstValueFrom(
          this.http.post<RespuestaCloudinary>(endpoint, formData)
        );

        return {
          exito: true,
          url: respuesta.secure_url,
          publicId: respuesta.public_id,
          formato: respuesta.format,
          tamanoKb: Math.round((respuesta.bytes || 0) / 1024)
        };
      } catch {
        // Intentar con el siguiente preset disponible
      }
    }

    return {
      exito: false,
      requiereConfiguracion: true,
      mensajeError:
        'Para subir a tu cuenta Cloudinary (dsebmsrno), ingresa tu API Secret o habilita un Upload Preset Unsigned.'
    };
  }

  /**
   * Implementación pura de SHA-1 en TypeScript (RFC 3174) para firmar peticiones
   * de Cloudinary tanto en navegador como en Android WebView sin depender de HTTPS.
   */
  private sha1Hex(mensaje: string): string {
    const utf8 = unescape(encodeURIComponent(mensaje));
    const palabras: number[] = [];
    for (let i = 0; i < utf8.length; i++) {
      palabras[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
    }
    palabras[utf8.length >> 2] |= 0x80 << (24 - (utf8.length % 4) * 8);
    palabras[(((utf8.length + 8) >> 6) << 4) + 15] = utf8.length * 8;

    const w = new Array<number>(80);
    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    const rotl = (n: number, s: number) => (n << s) | (n >>> (32 - s));

    for (let i = 0; i < palabras.length; i += 16) {
      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;

      for (let j = 0; j < 80; j++) {
        if (j < 16) {
          w[j] = palabras[i + j] | 0;
        } else {
          w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
        }

        let f = 0;
        let k = 0;
        if (j < 20) {
          f = (b & c) | (~b & d);
          k = 0x5a827999;
        } else if (j < 40) {
          f = b ^ c ^ d;
          k = 0x6ed9eba1;
        } else if (j < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8f1bbcdc;
        } else {
          f = b ^ c ^ d;
          k = 0xca62c1d6;
        }

        const temp = (rotl(a, 5) + f + e + k + w[j]) | 0;
        e = d;
        d = c;
        c = rotl(b, 30);
        b = a;
        a = temp;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
    }

    const aHex = (n: number) => {
      let s = '';
      for (let i = 7; i >= 0; i--) {
        s += ((n >>> (i * 4)) & 0x0f).toString(16);
      }
      return s;
    };

    return aHex(h0) + aHex(h1) + aHex(h2) + aHex(h3) + aHex(h4);
  }
}

