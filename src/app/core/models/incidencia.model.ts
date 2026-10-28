export type TipoIncidencia =
  | 'Luminaria dañada'
  | 'Bache'
  | 'Señalización deteriorada'
  | 'Alcantarilla obstruida'
  | 'Daño en parque';

export type PrioridadIncidencia = 'baja' | 'media' | 'alta';

export type EstadoIncidencia = 'pendiente' | 'en proceso' | 'resuelta';

export interface ClimaInfo {
  temperatura: number;
  precipitacionMm: number;
  condicion: string;
  alertaMantenimiento: boolean;
}

export interface Incidencia {
  id?: string;
  codigo: string;               
  tipo: TipoIncidencia;         
  descripcion: string;         
  direccion: string;            
  sector: string;              
  fecha: string;               
  estado: EstadoIncidencia;     
  fotografia?: string | null;   
  prioridad: PrioridadIncidencia;
  latitud?: number | null;
  longitud?: number | null;
  observacion?: string | null;  
  clima?: ClimaInfo | null;    
}