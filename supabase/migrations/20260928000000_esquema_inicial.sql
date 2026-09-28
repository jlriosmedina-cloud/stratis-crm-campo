-- Foto del esquema public de Supabase (proyecto xwvpnagvdrjffayzsnke) · 2026-09-27 19:25 Lima
-- Solo estructura: tablas, restricciones, índices, funciones, vistas, triggers, RLS, políticas y permisos de funciones. Sin datos.
-- Es una referencia del estado actual (v1 y v2 conviven); no está pensada para ejecutarse de una vez sobre una base existente.

-- ===================== EXTENSIONES =====================
-- pg_stat_statements 1.11
-- pgcrypto 1.3
-- plpgsql 1.0
-- supabase_vault 0.3.1
-- uuid-ossp 1.1

-- ===================== TIPOS =====================

-- ===================== SECUENCIAS =====================
create sequence if not exists public.auditoria_id_seq;
create sequence if not exists public.v2_direcciones_extra_id_seq;

-- ===================== TABLAS =====================
create table public.acciones_seguimiento (
  codigo text not null,
  nombre text not null,
  descripcion text,
  orden integer default 50 not null,
  activo boolean default true not null
);
alter table public.acciones_seguimiento enable row level security;

create table public.auditoria (
  id bigint default nextval('auditoria_id_seq'::regclass) not null,
  tabla text not null,
  accion text not null,
  registro_id text,
  customer_id text,
  comercio text,
  correo text,
  ejecutivo text,
  detalle jsonb,
  creado_en timestamp with time zone default now() not null
);
alter table public.auditoria enable row level security;

create table public.bono_parametros (
  vigente_desde text not null,
  valor jsonb not null,
  nota text,
  creado_en timestamp with time zone default now() not null,
  creado_por text
);
alter table public.bono_parametros enable row level security;

create table public.clientes (
  customer_id text not null,
  rubro text not null,
  rubro_otro text,
  nombre_comercio text not null,
  distrito text,
  direccion text,
  estado text default 'ACTIVO'::text,
  observacion text,
  asignado text not null,
  asignado_correo text not null,
  creado_en timestamp with time zone default now() not null,
  modificado_en timestamp with time zone default now() not null,
  resultado_gestion text default 'PENDIENTE'::text not null,
  tipo_registro text default 'CARTERA'::text not null,
  ruc text,
  razon_social text,
  cerrado_en timestamp with time zone,
  motivo_no_retencion text,
  contacto_bbva text,
  motivo_negociacion text,
  estado_fijado text,
  estado_fijado_motivo text,
  canal_confirmado_en timestamp with time zone,
  canal_confirmado_por text,
  origen_lead text,
  direccion_maps text,
  referencia_maps text,
  apuntes text
);
alter table public.clientes enable row level security;

create table public.comercios_vinculados (
  id uuid default gen_random_uuid() not null,
  customer_id_a text not null,
  customer_id_b text not null,
  motivo text not null,
  validado_por text not null,
  validado_en timestamp with time zone default now() not null,
  anulado_en timestamp with time zone,
  anulado_por text
);
alter table public.comercios_vinculados enable row level security;

create table public.config (
  clave text not null,
  valor text not null,
  nota text
);
alter table public.config enable row level security;

create table public.facturacion (
  periodo text not null,
  correo text not null,
  monto_inicial numeric(14,2),
  monto_final numeric(14,2),
  actualizado_en timestamp with time zone default now() not null,
  actualizado_por text
);
alter table public.facturacion enable row level security;

create table public.facturacion_base (
  correo text not null,
  monto numeric(14,2) not null,
  nota text,
  actualizado_en timestamp with time zone default now() not null,
  actualizado_por text
);
alter table public.facturacion_base enable row level security;

create table public.interacciones (
  id uuid default gen_random_uuid() not null,
  customer_id text not null,
  correo_stratis text not null,
  ejecutivo text not null,
  fecha_contacto date not null,
  hora_contacto time without time zone not null,
  tipo_contacto text not null,
  resultado text default 'efectivo'::text not null,
  visita_presencial text,
  visita_virtual text,
  cumple_visita text,
  fecha_visita_actualizada date,
  ubicacion text,
  ubicacion_verificada boolean default false not null,
  evidencia_path text,
  calificacion text,
  comentario_ejecutivo text not null,
  comentario_cliente text,
  creado_en timestamp with time zone default now() not null,
  modificado_en timestamp with time zone default now() not null,
  gasto_total numeric(10,2),
  gastos_paths text[] default '{}'::text[] not null,
  ubicacion_exenta boolean default false not null,
  ubicacion_exenta_motivo text,
  con text default 'CLIENTE'::text not null,
  proposito text,
  inferida boolean default false not null,
  destinatario text,
  espera text,
  copia_bbva boolean default false not null
);
alter table public.interacciones enable row level security;

create table public.metas (
  correo text not null,
  periodo date not null,
  cartera_asignada integer default 0 not null,
  nota text,
  actualizado_por text,
  actualizado_en timestamp with time zone default now() not null
);
alter table public.metas enable row level security;

create table public.periodos_cerrados (
  id uuid default gen_random_uuid() not null,
  periodo text not null,
  foto jsonb not null,
  nota text,
  cerrado_en timestamp with time zone default now() not null,
  cerrado_por text,
  anulado_en timestamp with time zone,
  anulado_por text,
  anulado_nota text
);
alter table public.periodos_cerrados enable row level security;

create table public.reporte_config (
  clave text not null,
  valor jsonb not null,
  nota text,
  actualizado_en timestamp with time zone default now() not null,
  actualizado_por text
);
alter table public.reporte_config enable row level security;

create table public.rubros (
  codigo text not null,
  nombre text not null,
  orden integer default 99 not null
);
alter table public.rubros enable row level security;

create table public.seguimientos (
  id uuid default gen_random_uuid() not null,
  customer_id text not null,
  interaccion_id uuid,
  accion text not null,
  fecha_objetivo date not null,
  comentario text,
  correo_stratis text not null,
  ejecutivo text not null,
  creado_en timestamp with time zone default now() not null,
  cerrado_en timestamp with time zone,
  cerrado_por text,
  hora_inicio time without time zone,
  duracion_min integer default 60 not null,
  modalidad text,
  reagendada_de uuid,
  interaccion_cumple uuid,
  cerrado_motivo text,
  historial jsonb default '[]'::jsonb not null
);
alter table public.seguimientos enable row level security;

create table public.usuarios (
  correo text not null,
  nombre text not null,
  nombre_corto text,
  rol text default 'Ejecutivo'::text not null,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null
);
alter table public.usuarios enable row level security;

create table public.v2_acceso_escritorio (
  correo text not null,
  agregado_en timestamp with time zone default now() not null,
  nota text
);
alter table public.v2_acceso_escritorio enable row level security;

create table public.v2_asignaciones (
  periodo text not null,
  customer_id text not null,
  correo text,
  ruta text,
  orden integer,
  carga_id bigint,
  tomado_en timestamp with time zone
);
alter table public.v2_asignaciones enable row level security;

create table public.v2_bitacora_visita (
  id bigint generated always as identity not null,
  visita_id uuid not null,
  accion text not null,
  por text not null,
  en timestamp with time zone default now() not null,
  antes text,
  despues text
);
alter table public.v2_bitacora_visita enable row level security;

create table public.v2_cargas (
  id bigint generated always as identity not null,
  tipo text not null,
  archivo text,
  fecha_corte date,
  formato text,
  filas integer,
  notas text,
  por text default correo_actual() not null,
  en timestamp with time zone default now() not null
);
alter table public.v2_cargas enable row level security;

create table public.v2_comercios (
  customer_id text not null,
  razon_social text not null,
  rubro text,
  departamento text,
  provincia text,
  distrito text,
  direccion text,
  zona text,
  tasa_debito numeric(8,6),
  tasa_credito numeric(8,6),
  tasa_foranea numeric(8,6),
  estado text default 'Activado'::text not null,
  entrego_pos boolean,
  estado_por text,
  estado_en timestamp with time zone,
  nombre_comercial text,
  direccion_corregida text,
  referencia text,
  contacto text,
  corregido_por text,
  corregido_en timestamp with time zone,
  carga_id bigint,
  creado_en timestamp with time zone default now() not null,
  territorial text,
  direccion_original text,
  distrito_original text,
  referencia_base text,
  geo_lat double precision,
  geo_lng double precision,
  geo_calidad text,
  geo_detalle text,
  geo_en timestamp with time zone,
  ruc text,
  terminales integer,
  tasas_aprox boolean default true not null,
  geo_visita_id uuid
);
alter table public.v2_comercios enable row level security;

create table public.v2_correcciones (
  id bigint generated always as identity not null,
  customer_id text not null,
  por text not null,
  en timestamp with time zone default now() not null,
  antes jsonb,
  despues jsonb
);
alter table public.v2_correcciones enable row level security;

create table public.v2_direcciones_extra (
  id bigint default nextval('v2_direcciones_extra_id_seq'::regclass) not null,
  customer_id text not null,
  ruc text not null,
  orden integer not null,
  direccion text not null,
  distrito text not null,
  en_zona boolean not null,
  numero_sunat boolean default false not null,
  texto_bbva text,
  fuente text default 'BBVA · mismo RUC, otro customer ID'::text not null,
  activa boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  verificacion text,
  verif_nota text,
  verif_maps text,
  geo_lat double precision,
  geo_lng double precision,
  verificado_en timestamp with time zone,
  direccion_antes text
);
alter table public.v2_direcciones_extra enable row level security;

create table public.v2_fb_reorganizacion (
  visita_id uuid not null,
  antes_feedback text[],
  antes_acciones text[],
  antes_extra jsonb,
  feedback text[],
  acciones text[],
  extra jsonb,
  por_que text,
  aplicado_en timestamp with time zone default now() not null
);
alter table public.v2_fb_reorganizacion enable row level security;

create table public.v2_fb_segmentacion (
  visita_id uuid not null,
  customer_id text,
  antes_feedback text[],
  antes_acciones text[],
  antes_extra jsonb,
  feedback text[],
  acciones text[],
  extra jsonb,
  confianza text,
  criterio text,
  diferencia text,
  falta text[],
  segmentado_en timestamp with time zone default now() not null
);
alter table public.v2_fb_segmentacion enable row level security;

create table public.v2_feedback_acciones (
  texto text not null,
  ramas text[] not null,
  orden integer not null
);
alter table public.v2_feedback_acciones enable row level security;

create table public.v2_feedback_inferido (
  visita_id uuid not null,
  tipos text[] default '{}'::text[] not null,
  fuera_de_lista text[] default '{}'::text[] not null,
  confianza text not null,
  criterio text not null,
  clasificado_por text default 'Stratis (lectura del comentario)'::text not null,
  clasificado_en timestamp with time zone default now() not null
);
alter table public.v2_feedback_inferido enable row level security;

create table public.v2_feedback_tipos (
  texto text not null,
  grupo text not null,
  orden integer not null,
  bbva boolean default false not null
);
alter table public.v2_feedback_tipos enable row level security;

create table public.v2_feriados (
  fecha date not null,
  nombre text
);
alter table public.v2_feriados enable row level security;

create table public.v2_geo_distritos (
  clave text not null,
  nombre text not null,
  provincia text not null,
  osm_id bigint,
  geometria jsonb not null,
  fuente text default 'OpenStreetMap (ODbL) · simplificado ~13 m'::text not null,
  cargado_en timestamp with time zone default now() not null
);
alter table public.v2_geo_distritos enable row level security;

create table public.v2_limpieza_marcaciones (
  visita_id uuid not null,
  tipo text not null,
  antes jsonb not null,
  despues jsonb,
  anular text,
  confianza text,
  por_que text,
  aplicado_en timestamp with time zone default now() not null
);
alter table public.v2_limpieza_marcaciones enable row level security;

create table public.v2_motivo_si_inferido (
  visita_id uuid not null,
  motivos text[] default '{}'::text[] not null,
  confianza text not null,
  criterio text not null,
  clasificado_en timestamp with time zone default now() not null
);
alter table public.v2_motivo_si_inferido enable row level security;

create table public.v2_motivo_si_tipos (
  texto text not null,
  orden integer not null
);
alter table public.v2_motivo_si_tipos enable row level security;

create table public.v2_parametros (
  periodo text not null,
  peso_reactivados numeric not null,
  peso_visitas numeric not null,
  peso_conversion numeric not null,
  meta_visitas integer not null,
  meta_reactivados integer not null,
  meta_conversion numeric not null,
  puntos_min numeric not null,
  puntos_tope numeric not null,
  bono_min numeric not null,
  bono_tope numeric not null,
  bono_max numeric not null,
  bbva_meta_reactivados integer,
  pago_pct numeric default 80 not null,
  notas text
);
alter table public.v2_parametros enable row level security;

create table public.v2_periodos (
  id text not null,
  ini date not null,
  fin date not null,
  estado text default 'abierto'::text not null
);
alter table public.v2_periodos enable row level security;

create table public.v2_sunat (
  ruc text not null,
  razon_social text,
  estado text,
  condicion text,
  direccion text,
  distrito text,
  provincia text,
  departamento text,
  fuente text,
  consultado_en timestamp with time zone default now() not null,
  geo_lat double precision,
  geo_lng double precision,
  geo_calidad text,
  geo_parecido numeric,
  geo_detalle text,
  geo_en timestamp with time zone,
  difiere boolean default false not null
);
alter table public.v2_sunat enable row level security;

create table public.v2_transacciones (
  fecha_corte date not null,
  customer_id text not null,
  mes text not null,
  formato text default 'acumulado_mes'::text not null,
  vol numeric(16,2),
  trx integer,
  carga_id bigint
);
alter table public.v2_transacciones enable row level security;

create table public.v2_verificacion_maps (
  customer_id text not null,
  tanda integer not null,
  resultado text not null,
  nota text,
  maps text,
  lat double precision,
  lng double precision,
  lat_antes double precision,
  lng_antes double precision,
  calidad_antes text,
  detalle_antes text,
  calidad_nueva text,
  punto_movido boolean default false not null,
  dudoso boolean default false not null,
  revisado_jose boolean default false not null,
  verificado_en timestamp with time zone default now() not null
);
alter table public.v2_verificacion_maps enable row level security;

create table public.v2_visitas (
  id uuid default gen_random_uuid() not null,
  periodo text not null,
  customer_id text not null,
  correo text not null,
  visitado_en timestamp with time zone not null,
  recibido_en timestamp with time zone default now() not null,
  lat double precision,
  lng double precision,
  precision_m numeric,
  con text not null,
  motivo text,
  que text not null,
  decision text,
  equipo text,
  fecha_reagenda date,
  comentario text not null,
  cliente_uid text,
  anulada_en timestamp with time zone,
  anulada_por text,
  anulada_motivo text,
  distancia_m integer,
  anul_pedida_en timestamp with time zone,
  anul_pedida_por text,
  anul_pedida_motivo text,
  anul_resuelta_en timestamp with time zone,
  anul_resuelta_por text,
  anul_resuelta_nota text,
  comentario_editado_en timestamp with time zone,
  resultado_editado_en timestamp with time zone,
  resultado_editado_por text,
  validacion text default 'pendiente'::text not null,
  validacion_en timestamp with time zone,
  validacion_por text,
  validacion_motivo text,
  validacion_nota text,
  ref_lat double precision,
  ref_lng double precision,
  ref_calidad text,
  ref_nota text,
  direccion_ok boolean,
  plazo_hasta date,
  fuera_plazo boolean default false not null,
  ubicacion_editada_en timestamp with time zone,
  ubicacion_editada_por text,
  feedback text[],
  feedback_nota text,
  motivos_si text[],
  comercio_ubicado boolean,
  direccion_nueva text,
  fb_acciones text[],
  fb_extra jsonb,
  comentario_voz text,
  ia_propuesta jsonb
);
alter table public.v2_visitas enable row level security;

-- ===================== RESTRICCIONES (PK, UNIQUE, CHECK) =====================
alter table public.acciones_seguimiento add constraint acciones_seguimiento_pkey PRIMARY KEY (codigo);
alter table public.auditoria add constraint auditoria_accion_check CHECK ((accion = ANY (ARRAY['editar'::text, 'eliminar'::text])));
alter table public.auditoria add constraint auditoria_pkey PRIMARY KEY (id);
alter table public.bono_parametros add constraint ck_bono_periodo CHECK ((vigente_desde ~ '^[0-9]{4}-[0-9]{2}$'::text));
alter table public.bono_parametros add constraint bono_parametros_pkey PRIMARY KEY (vigente_desde);
alter table public.clientes add constraint ck_cartera_completa CHECK (((tipo_registro <> 'CARTERA'::text) OR ((COALESCE(TRIM(BOTH FROM distrito), ''::text) <> ''::text) AND (COALESCE(TRIM(BOTH FROM direccion), ''::text) <> ''::text) AND (estado = ANY (ARRAY['ACTIVO'::text, 'DE BAJA'::text])) AND (ruc IS NULL) AND (razon_social IS NULL))));
alter table public.clientes add constraint ck_contacto_bbva CHECK (((contacto_bbva IS NULL) OR (contacto_bbva = ANY (ARRAY['CORREO'::text, 'LLAMADA'::text, 'WHATSAPP'::text, 'VISITA'::text, 'CHAT'::text, 'CORREO_CC'::text]))));
alter table public.clientes add constraint ck_customer_id CHECK (((length(TRIM(BOTH FROM customer_id)) >= 3) AND (length(TRIM(BOTH FROM customer_id)) <= 30)));
alter table public.clientes add constraint ck_motivo_no_retencion CHECK (((motivo_no_retencion IS NULL) OR (motivo_no_retencion = ANY (ARRAY['TASA'::text, 'SERVICIO'::text, 'COMPETENCIA'::text, 'CERRO'::text, 'NO_DECIDE'::text, 'NO_CONTACTABLE'::text, 'OTRO'::text]))));
alter table public.clientes add constraint ck_nuevo_con_datos CHECK (((tipo_registro <> 'NUEVO'::text) OR ((ruc ~ '^[0-9]{11}$'::text) AND (COALESCE(TRIM(BOTH FROM razon_social), ''::text) <> ''::text) AND (distrito IS NULL) AND (direccion IS NULL) AND (estado IS NULL))));
alter table public.clientes add constraint ck_nuevo_no_retenido CHECK (((tipo_registro <> 'NUEVO'::text) OR (COALESCE(resultado_gestion, 'PENDIENTE'::text) <> 'RETENIDO'::text)));
alter table public.clientes add constraint ck_origen_lead CHECK (((origen_lead IS NULL) OR ((tipo_registro = 'NUEVO'::text) AND (origen_lead = ANY (ARRAY['DENTRO'::text, 'FUERA'::text])))));
alter table public.clientes add constraint ck_resultado_gestion CHECK ((resultado_gestion = ANY (ARRAY['PENDIENTE'::text, 'RETENIDO'::text, 'VENTA'::text, 'PERDIDO'::text])));
alter table public.clientes add constraint ck_rubro_otro CHECK (((rubro <> 'otro'::text) OR (COALESCE(rubro_otro, ''::text) <> ''::text)));
alter table public.clientes add constraint ck_tipo_registro CHECK ((tipo_registro = ANY (ARRAY['CARTERA'::text, 'NUEVO'::text])));
alter table public.clientes add constraint clientes_estado_check CHECK ((estado = ANY (ARRAY['ACTIVO'::text, 'DE BAJA'::text])));
alter table public.clientes add constraint clientes_pkey PRIMARY KEY (customer_id);
alter table public.comercios_vinculados add constraint comercios_vinculados_orden CHECK ((customer_id_a < customer_id_b));
alter table public.comercios_vinculados add constraint comercios_vinculados_pkey PRIMARY KEY (id);
alter table public.config add constraint config_pkey PRIMARY KEY (clave);
alter table public.facturacion add constraint ck_facturacion_montos CHECK (((COALESCE(monto_inicial, (0)::numeric) >= (0)::numeric) AND (COALESCE(monto_final, (0)::numeric) >= (0)::numeric)));
alter table public.facturacion add constraint facturacion_pkey PRIMARY KEY (periodo, correo);
alter table public.facturacion_base add constraint ck_fact_base_monto CHECK ((monto >= (0)::numeric));
alter table public.facturacion_base add constraint facturacion_base_pkey PRIMARY KEY (correo);
alter table public.interacciones add constraint ck_con_interaccion CHECK ((con = ANY (ARRAY['CLIENTE'::text, 'BBVA'::text])));
alter table public.interacciones add constraint ck_gasto_con_comprobante CHECK (((COALESCE(gasto_total, (0)::numeric) = (0)::numeric) OR (COALESCE(array_length(gastos_paths, 1), 0) > 0)));
alter table public.interacciones add constraint ck_gasto_presencial CHECK ((((COALESCE(gasto_total, (0)::numeric) = (0)::numeric) AND (COALESCE(array_length(gastos_paths, 1), 0) = 0)) OR (tipo_contacto = ANY (ARRAY['visita_presencial'::text, 'reunion_presencial'::text]))));
alter table public.interacciones add constraint ck_gasto_rango CHECK (((gasto_total IS NULL) OR ((gasto_total >= (0)::numeric) AND (gasto_total <= (2000)::numeric))));
alter table public.interacciones add constraint ck_inter_destinatario CHECK (((destinatario IS NULL) OR (destinatario = ANY (ARRAY['cliente'::text, 'bbva'::text]))));
alter table public.interacciones add constraint ck_proposito CHECK (((proposito IS NULL) OR (proposito = ANY (ARRAY['primer_contacto'::text, 'respuesta'::text, 'respaldo_chat'::text, 'insistencia'::text, 'negociacion'::text]))));
alter table public.interacciones add constraint ck_ubicacion_verificada CHECK (((ubicacion_verificada = false) OR (ubicacion ~ '^-?[0-9]{1,3}\.[0-9]+, *-?[0-9]{1,3}\.[0-9]+'::text)));
alter table public.interacciones add constraint ck_vocabulario_con CHECK ((((con = 'BBVA'::text) AND (tipo_contacto ~~ 'bbva\_%'::text) AND (resultado ~~ 'bbva\_%'::text)) OR ((con = 'CLIENTE'::text) AND (tipo_contacto !~~ 'bbva\_%'::text) AND (resultado !~~ 'bbva\_%'::text))));
alter table public.interacciones add constraint interacciones_calificacion_check CHECK (((calificacion IS NULL) OR (calificacion = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text]))));
alter table public.interacciones add constraint interacciones_resultado_check CHECK ((resultado = ANY (ARRAY['efectivo'::text, 'no_contesta'::text, 'local_cerrado'::text, 'titular_ausente'::text, 'datos_errados'::text, 'rechazo'::text, 'bbva_respondio'::text, 'bbva_sin_respuesta'::text])));
alter table public.interacciones add constraint interacciones_tipo_contacto_check CHECK ((tipo_contacto = ANY (ARRAY['visita_presencial'::text, 'reunion_presencial'::text, 'reunion_virtual'::text, 'videollamada'::text, 'llamada'::text, 'whatsapp'::text, 'correo'::text, 'bbva_correo'::text, 'bbva_chat'::text, 'bbva_llamada'::text, 'bbva_whatsapp'::text, 'bbva_presencial'::text, 'bbva_correo_cliente'::text])));
alter table public.interacciones add constraint interacciones_pkey PRIMARY KEY (id);
alter table public.metas add constraint metas_cartera_asignada_check CHECK (((cartera_asignada >= 0) AND (cartera_asignada <= 100000)));
alter table public.metas add constraint metas_pkey PRIMARY KEY (correo, periodo);
alter table public.periodos_cerrados add constraint ck_cierre_periodo CHECK ((periodo ~ '^[0-9]{4}-[0-9]{2}$'::text));
alter table public.periodos_cerrados add constraint periodos_cerrados_pkey PRIMARY KEY (id);
alter table public.reporte_config add constraint ck_reporte_clave CHECK ((clave = ANY (ARRAY['proyecto'::text, 'hitos'::text, 'relato'::text, 'lecturas'::text, 'notas'::text, 'objetivos'::text, 'acuerdos'::text, 'cierre_acuerdos'::text])));
alter table public.reporte_config add constraint reporte_config_pkey PRIMARY KEY (clave);
alter table public.rubros add constraint rubros_pkey PRIMARY KEY (codigo);
alter table public.seguimientos add constraint ck_seg_cerrado_motivo CHECK (((cerrado_motivo IS NULL) OR (cerrado_motivo = ANY (ARRAY['CUMPLIDA'::text, 'GESTION'::text, 'DESCARTADA'::text, 'REAGENDADA'::text, 'CIERRE'::text]))));
alter table public.seguimientos add constraint ck_seg_cita_con_hora CHECK (((modalidad IS NULL) OR (hora_inicio IS NOT NULL)));
alter table public.seguimientos add constraint ck_seg_duracion CHECK (((duracion_min >= 15) AND (duracion_min <= 480)));
alter table public.seguimientos add constraint ck_seg_modalidad CHECK (((modalidad IS NULL) OR (modalidad = ANY (ARRAY['PRESENCIAL'::text, 'VIRTUAL'::text]))));
alter table public.seguimientos add constraint seguimientos_pkey PRIMARY KEY (id);
alter table public.usuarios add constraint usuarios_rol_check CHECK ((rol = ANY (ARRAY['Ejecutivo'::text, 'Analista'::text, 'Manager'::text])));
alter table public.usuarios add constraint usuarios_pkey PRIMARY KEY (correo);
alter table public.v2_acceso_escritorio add constraint v2_acceso_escritorio_pkey PRIMARY KEY (correo);
alter table public.v2_asignaciones add constraint v2_asignaciones_pkey PRIMARY KEY (periodo, customer_id);
alter table public.v2_bitacora_visita add constraint v2_bitacora_visita_accion_check CHECK ((accion = ANY (ARRAY['comentario'::text, 'resultado'::text, 'traslado'::text, 'pedido'::text, 'aprobado'::text, 'rechazado'::text, 'validada'::text, 'observada'::text, 'revision'::text, 'anulada'::text, 'restituida'::text, 'ubicacion'::text])));
alter table public.v2_bitacora_visita add constraint v2_bitacora_visita_pkey PRIMARY KEY (id);
alter table public.v2_cargas add constraint v2_cargas_formato_check CHECK ((formato = ANY (ARRAY['acumulado_mes'::text, 'diario'::text])));
alter table public.v2_cargas add constraint v2_cargas_tipo_check CHECK ((tipo = ANY (ARRAY['base'::text, 'transacciones'::text, 'estado'::text])));
alter table public.v2_cargas add constraint v2_cargas_pkey PRIMARY KEY (id);
alter table public.v2_comercios add constraint ck_v2_customer_id_8 CHECK ((customer_id ~ '^[0-9]{8,}$'::text));
alter table public.v2_comercios add constraint v2_comercios_estado_check CHECK ((estado = ANY (ARRAY['Activado'::text, 'Cancelado'::text])));
alter table public.v2_comercios add constraint v2_comercios_geo_calidad_check CHECK ((geo_calidad = ANY (ARRAY['comercio'::text, 'numero'::text, 'calle'::text, 'lugar'::text, 'distrito'::text, 'sin_ubicar'::text, 'visita'::text])));
alter table public.v2_comercios add constraint v2_comercios_pkey PRIMARY KEY (customer_id);
alter table public.v2_correcciones add constraint v2_correcciones_pkey PRIMARY KEY (id);
alter table public.v2_direcciones_extra add constraint v2_direcciones_extra_pkey PRIMARY KEY (id);
alter table public.v2_direcciones_extra add constraint v2_direcciones_extra_customer_id_orden_key UNIQUE (customer_id, orden);
alter table public.v2_fb_reorganizacion add constraint v2_fb_reorganizacion_pkey PRIMARY KEY (visita_id);
alter table public.v2_fb_segmentacion add constraint v2_fb_segmentacion_confianza_check CHECK ((confianza = ANY (ARRAY['Alta'::text, 'Media'::text, 'Sin detalle'::text])));
alter table public.v2_fb_segmentacion add constraint v2_fb_segmentacion_pkey PRIMARY KEY (visita_id);
alter table public.v2_feedback_acciones add constraint v2_feedback_acciones_pkey PRIMARY KEY (texto);
alter table public.v2_feedback_inferido add constraint v2_feedback_inferido_confianza_check CHECK ((confianza = ANY (ARRAY['Alta'::text, 'Media'::text, 'Sin detalle'::text])));
alter table public.v2_feedback_inferido add constraint v2_feedback_inferido_pkey PRIMARY KEY (visita_id);
alter table public.v2_feedback_tipos add constraint v2_feedback_tipos_pkey PRIMARY KEY (texto);
alter table public.v2_feedback_tipos add constraint v2_feedback_tipos_orden_key UNIQUE (orden);
alter table public.v2_feriados add constraint v2_feriados_pkey PRIMARY KEY (fecha);
alter table public.v2_geo_distritos add constraint v2_geo_distritos_pkey PRIMARY KEY (clave);
alter table public.v2_limpieza_marcaciones add constraint v2_limpieza_marcaciones_pkey PRIMARY KEY (visita_id);
alter table public.v2_motivo_si_inferido add constraint v2_motivo_si_inferido_confianza_check CHECK ((confianza = ANY (ARRAY['Alta'::text, 'Media'::text, 'Sin detalle'::text])));
alter table public.v2_motivo_si_inferido add constraint v2_motivo_si_inferido_pkey PRIMARY KEY (visita_id);
alter table public.v2_motivo_si_tipos add constraint v2_motivo_si_tipos_pkey PRIMARY KEY (texto);
alter table public.v2_motivo_si_tipos add constraint v2_motivo_si_tipos_orden_key UNIQUE (orden);
alter table public.v2_parametros add constraint v2_parametros_escala CHECK (((puntos_tope > puntos_min) AND (bono_tope >= bono_min) AND (bono_max >= bono_tope)));
alter table public.v2_parametros add constraint v2_parametros_meta_conversion_check CHECK ((meta_conversion > (0)::numeric));
alter table public.v2_parametros add constraint v2_parametros_meta_reactivados_check CHECK ((meta_reactivados > 0));
alter table public.v2_parametros add constraint v2_parametros_meta_visitas_check CHECK ((meta_visitas > 0));
alter table public.v2_parametros add constraint v2_parametros_pago_pct_check CHECK (((pago_pct >= (0)::numeric) AND (pago_pct <= (100)::numeric)));
alter table public.v2_parametros add constraint v2_parametros_peso_conversion_check CHECK ((peso_conversion >= (0)::numeric));
alter table public.v2_parametros add constraint v2_parametros_peso_reactivados_check CHECK ((peso_reactivados >= (0)::numeric));
alter table public.v2_parametros add constraint v2_parametros_peso_visitas_check CHECK ((peso_visitas >= (0)::numeric));
alter table public.v2_parametros add constraint v2_parametros_pesos_100 CHECK ((((peso_reactivados + peso_visitas) + peso_conversion) = (100)::numeric));
alter table public.v2_parametros add constraint v2_parametros_pkey PRIMARY KEY (periodo);
alter table public.v2_periodos add constraint v2_periodos_check CHECK ((fin >= ini));
alter table public.v2_periodos add constraint v2_periodos_estado_check CHECK ((estado = ANY (ARRAY['abierto'::text, 'liquidacion'::text, 'cerrado'::text])));
alter table public.v2_periodos add constraint v2_periodos_id_check CHECK ((id ~ '^[0-9]{4}-[0-9]{2}$'::text));
alter table public.v2_periodos add constraint v2_periodos_pkey PRIMARY KEY (id);
alter table public.v2_sunat add constraint v2_sunat_pkey PRIMARY KEY (ruc);
alter table public.v2_transacciones add constraint v2_transacciones_formato_check CHECK ((formato = ANY (ARRAY['acumulado_mes'::text, 'diario'::text])));
alter table public.v2_transacciones add constraint v2_transacciones_mes_check CHECK ((mes ~ '^[0-9]{4}-[0-9]{2}$'::text));
alter table public.v2_transacciones add constraint v2_transacciones_pkey PRIMARY KEY (customer_id, mes, fecha_corte);
alter table public.v2_verificacion_maps add constraint v2_verificacion_maps_resultado_check CHECK ((resultado = ANY (ARRAY['confirmado'::text, 'probable'::text, 'otra_ubicacion'::text, 'direccion_ubicada'::text, 'direccion_aproximada'::text, 'no_ubicado'::text])));
alter table public.v2_verificacion_maps add constraint v2_verificacion_maps_pkey PRIMARY KEY (customer_id);
alter table public.v2_visitas add constraint v2_visitas_check CHECK ((((con = 'Nadie'::text) = (motivo IS NOT NULL)) OR (con <> 'Nadie'::text)));
alter table public.v2_visitas add constraint v2_visitas_check1 CHECK (((decision IS NULL) OR (que = 'Reunión concretada'::text)));
alter table public.v2_visitas add constraint v2_visitas_check2 CHECK (((equipo IS NULL) OR (decision = 'Desiste del producto'::text)));
alter table public.v2_visitas add constraint v2_visitas_comentario_check CHECK ((length(btrim(comentario)) >= 5));
alter table public.v2_visitas add constraint v2_visitas_con_check CHECK ((con = ANY (ARRAY['Dueño'::text, 'Tercero'::text, 'Nadie'::text])));
alter table public.v2_visitas add constraint v2_visitas_decision_check CHECK ((decision = ANY (ARRAY['Realizará consumos'::text, 'Aún no decide'::text, 'Desiste del producto'::text])));
alter table public.v2_visitas add constraint v2_visitas_equipo_check CHECK ((equipo = ANY (ARRAY['Sí'::text, 'No'::text, 'Pendiente'::text])));
alter table public.v2_visitas add constraint v2_visitas_feedback_nota_largo CHECK (((feedback_nota IS NULL) OR (char_length(feedback_nota) <= 300)));
alter table public.v2_visitas add constraint v2_visitas_motivo_check CHECK ((motivo = ANY (ARRAY['Cerrado'::text, 'No estaba'::text, 'No atendió'::text, 'Dirección errada'::text])));
alter table public.v2_visitas add constraint v2_visitas_que_check CHECK ((que = ANY (ARRAY['Reunión concretada'::text, 'Reagendada'::text, 'Sin éxito'::text])));
alter table public.v2_visitas add constraint v2_visitas_validacion_check CHECK ((validacion = ANY (ARRAY['pendiente'::text, 'validada'::text, 'observada'::text])));
alter table public.v2_visitas add constraint v2_visitas_pkey PRIMARY KEY (id);
alter table public.v2_visitas add constraint v2_visitas_cliente_uid_key UNIQUE (cliente_uid);

-- ===================== LLAVES FORÁNEAS =====================
alter table public.clientes add constraint clientes_asignado_correo_fkey FOREIGN KEY (asignado_correo) REFERENCES usuarios(correo);
alter table public.clientes add constraint clientes_rubro_fkey FOREIGN KEY (rubro) REFERENCES rubros(codigo);
alter table public.comercios_vinculados add constraint comercios_vinculados_customer_id_a_fkey FOREIGN KEY (customer_id_a) REFERENCES clientes(customer_id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.comercios_vinculados add constraint comercios_vinculados_customer_id_b_fkey FOREIGN KEY (customer_id_b) REFERENCES clientes(customer_id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.interacciones add constraint interacciones_correo_stratis_fkey FOREIGN KEY (correo_stratis) REFERENCES usuarios(correo);
alter table public.interacciones add constraint interacciones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES clientes(customer_id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.metas add constraint metas_correo_fkey FOREIGN KEY (correo) REFERENCES usuarios(correo) ON DELETE CASCADE;
alter table public.seguimientos add constraint seguimientos_accion_fkey FOREIGN KEY (accion) REFERENCES acciones_seguimiento(codigo) ON UPDATE CASCADE;
alter table public.seguimientos add constraint seguimientos_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES clientes(customer_id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.seguimientos add constraint seguimientos_interaccion_cumple_fkey FOREIGN KEY (interaccion_cumple) REFERENCES interacciones(id) ON DELETE SET NULL;
alter table public.seguimientos add constraint seguimientos_interaccion_id_fkey FOREIGN KEY (interaccion_id) REFERENCES interacciones(id) ON DELETE SET NULL;
alter table public.seguimientos add constraint seguimientos_reagendada_de_fkey FOREIGN KEY (reagendada_de) REFERENCES seguimientos(id) ON DELETE SET NULL;
alter table public.v2_acceso_escritorio add constraint v2_acceso_escritorio_correo_fkey FOREIGN KEY (correo) REFERENCES usuarios(correo);
alter table public.v2_asignaciones add constraint v2_asignaciones_carga_id_fkey FOREIGN KEY (carga_id) REFERENCES v2_cargas(id);
alter table public.v2_asignaciones add constraint v2_asignaciones_correo_fkey FOREIGN KEY (correo) REFERENCES usuarios(correo);
alter table public.v2_asignaciones add constraint v2_asignaciones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES v2_comercios(customer_id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.v2_asignaciones add constraint v2_asignaciones_periodo_fkey FOREIGN KEY (periodo) REFERENCES v2_periodos(id);
alter table public.v2_bitacora_visita add constraint v2_bitacora_visita_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES v2_visitas(id) ON DELETE CASCADE;
alter table public.v2_comercios add constraint v2_comercios_carga_id_fkey FOREIGN KEY (carga_id) REFERENCES v2_cargas(id);
alter table public.v2_correcciones add constraint v2_correcciones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES v2_comercios(customer_id) ON UPDATE CASCADE;
alter table public.v2_direcciones_extra add constraint v2_direcciones_extra_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES v2_comercios(customer_id);
alter table public.v2_fb_reorganizacion add constraint v2_fb_reorganizacion_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES v2_visitas(id) ON DELETE CASCADE;
alter table public.v2_fb_segmentacion add constraint v2_fb_segmentacion_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES v2_visitas(id) ON DELETE CASCADE;
alter table public.v2_feedback_inferido add constraint v2_feedback_inferido_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES v2_visitas(id) ON DELETE CASCADE;
alter table public.v2_limpieza_marcaciones add constraint v2_limpieza_marcaciones_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES v2_visitas(id) ON DELETE CASCADE;
alter table public.v2_motivo_si_inferido add constraint v2_motivo_si_inferido_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES v2_visitas(id) ON DELETE CASCADE;
alter table public.v2_parametros add constraint v2_parametros_periodo_fkey FOREIGN KEY (periodo) REFERENCES v2_periodos(id) ON UPDATE CASCADE;
alter table public.v2_transacciones add constraint v2_transacciones_carga_id_fkey FOREIGN KEY (carga_id) REFERENCES v2_cargas(id);
alter table public.v2_transacciones add constraint v2_transacciones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES v2_comercios(customer_id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.v2_verificacion_maps add constraint v2_verificacion_maps_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES v2_comercios(customer_id);
alter table public.v2_visitas add constraint v2_visitas_correo_fkey FOREIGN KEY (correo) REFERENCES usuarios(correo);
alter table public.v2_visitas add constraint v2_visitas_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES v2_comercios(customer_id) ON UPDATE CASCADE;
alter table public.v2_visitas add constraint v2_visitas_periodo_fkey FOREIGN KEY (periodo) REFERENCES v2_periodos(id);

-- ===================== ÍNDICES =====================
CREATE INDEX ix_auditoria_fecha ON public.auditoria USING btree (creado_en DESC);
CREATE INDEX ix_clientes_asignado ON public.clientes USING btree (asignado_correo);
CREATE INDEX ix_clientes_distrito ON public.clientes USING btree (distrito);
CREATE INDEX ix_clientes_estado ON public.clientes USING btree (estado);
CREATE INDEX ix_clientes_origen_lead ON public.clientes USING btree (origen_lead) WHERE (tipo_registro = 'NUEVO'::text);
CREATE INDEX ix_clientes_rubro ON public.clientes USING btree (rubro);
CREATE UNIQUE INDEX ux_clientes_ruc ON public.clientes USING btree (ruc) WHERE (ruc IS NOT NULL);
CREATE INDEX comercios_vinculados_a_idx ON public.comercios_vinculados USING btree (customer_id_a);
CREATE INDEX comercios_vinculados_b_idx ON public.comercios_vinculados USING btree (customer_id_b);
CREATE UNIQUE INDEX comercios_vinculados_par_vivo ON public.comercios_vinculados USING btree (customer_id_a, customer_id_b) WHERE (anulado_en IS NULL);
CREATE INDEX ix_inter_cliente ON public.interacciones USING btree (customer_id, fecha_contacto DESC, hora_contacto DESC);
CREATE INDEX ix_inter_correo ON public.interacciones USING btree (correo_stratis);
CREATE INDEX ix_inter_result ON public.interacciones USING btree (resultado);
CREATE INDEX ix_metas_periodo ON public.metas USING btree (periodo DESC);
CREATE UNIQUE INDEX ux_periodo_cerrado_vigente ON public.periodos_cerrados USING btree (periodo) WHERE (anulado_en IS NULL);
CREATE INDEX ix_seg_calendario ON public.seguimientos USING btree (fecha_objetivo, hora_inicio, correo_stratis) WHERE (modalidad IS NOT NULL);
CREATE INDEX ix_seguimiento_agenda ON public.seguimientos USING btree (correo_stratis, fecha_objetivo) WHERE (cerrado_en IS NULL);
CREATE UNIQUE INDEX ux_seg_abierta_accion ON public.seguimientos USING btree (customer_id) WHERE ((cerrado_en IS NULL) AND (modalidad IS NULL));
CREATE UNIQUE INDEX ux_seg_abierta_cita ON public.seguimientos USING btree (customer_id) WHERE ((cerrado_en IS NULL) AND (modalidad IS NOT NULL));
CREATE INDEX ix_v2_asig_correo ON public.v2_asignaciones USING btree (correo, periodo);
CREATE INDEX ix_v2_bit_visita ON public.v2_bitacora_visita USING btree (visita_id, en DESC);
CREATE INDEX ix_v2_com_ruc ON public.v2_comercios USING btree (ruc) WHERE (ruc IS NOT NULL);
CREATE INDEX ix_v2_vis_cid ON public.v2_visitas USING btree (customer_id, visitado_en);
CREATE INDEX ix_v2_vis_correo ON public.v2_visitas USING btree (correo, periodo);
CREATE INDEX ix_v2_vis_pendiente ON public.v2_visitas USING btree (anul_pedida_en) WHERE ((anul_pedida_en IS NOT NULL) AND (anulada_en IS NULL) AND (anul_resuelta_en IS NULL));
CREATE INDEX v2_visitas_feedback_gin ON public.v2_visitas USING gin (feedback);
CREATE INDEX v2_visitas_validacion_idx ON public.v2_visitas USING btree (periodo, validacion) WHERE (validacion <> 'validada'::text);

-- ===================== FUNCIONES =====================
CREATE OR REPLACE FUNCTION public.ahora_lima()
 RETURNS timestamp without time zone
 LANGUAGE sql
 STABLE
AS $function$
  select (now() at time zone 'America/Lima')::timestamp
$function$
;

CREATE OR REPLACE FUNCTION public.anular_ubicacion(p_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old   public.interacciones%rowtype;
  v_admin boolean := public.es_admin();
  v_mio   boolean;
begin
  select * into v_old from public.interacciones where id = p_id;
  if not found then
    raise exception 'No se encontró esa gestión.' using errcode = 'no_data_found';
  end if;

  v_mio := v_old.correo_stratis = public.correo_actual();
  if not (v_admin or v_mio) then
    raise exception 'Solo puedes anular la ubicación de tus propias gestiones.'
      using errcode = 'insufficient_privilege';
  end if;
  if not v_admin and not public.edicion_libre() then
    raise exception 'La ventana de corrección está cerrada. Pídeselo a tu supervisor.'
      using errcode = 'check_violation';
  end if;
  if coalesce(v_old.ubicacion, '') = '' and v_old.ubicacion_verificada is not true then
    raise exception 'Esta gestión ya no tiene ubicación registrada.' using errcode = 'check_violation';
  end if;

  perform set_config('app.anulando_ubicacion', p_id::text, true);
  update public.interacciones set ubicacion = '' where id = p_id;
  perform set_config('app.anulando_ubicacion', '', true);

  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  select 'interacciones', 'editar', p_id::text, v_old.customer_id, c.nombre_comercio,
         public.correo_actual(), v_old.ejecutivo,
         jsonb_build_object(
           'ubicacion', jsonb_build_object('antes', coalesce(nullif(v_old.ubicacion,''),'(sin dato)'),
                                           'despues', '(anulada)'),
           '_nota', coalesce(nullif(trim(p_motivo), ''),
                             'Ubicación anulada: quedó como gestión sin respaldo de GPS'))
    from (select 1) t left join public.clientes c on c.customer_id = v_old.customer_id;

  return jsonb_build_object('ok', true, 'customer_id', v_old.customer_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.cfg(p_clave text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select valor from public.config where clave = p_clave
$function$
;

CREATE OR REPLACE FUNCTION public.convertir_a_venta_nueva(p_customer_id text, p_ruc text DEFAULT NULL::text, p_razon_social text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_actual text := trim(coalesce(p_customer_id, ''));
  v_ruc    text := trim(coalesce(p_ruc, ''));
  v_razon  text;
  v_nuevo  text;
  v_c      public.clientes%rowtype;
  v_n      int;
  v_quedan int;
  v_leido  public.clientes%rowtype;
begin
  if v_correo is null then
    raise exception 'Sesion no valida.' using errcode = 'check_violation';
  end if;
  if not public.es_admin() then
    raise exception 'Convertir un registro de cartera en venta nueva lo hacen el Analista o el Manager.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_c from public.clientes where customer_id = v_actual for update;
  if not found then
    raise exception 'No existe ningun comercio con el Customer ID %.', v_actual
      using errcode = 'check_violation';
  end if;
  if v_c.tipo_registro <> 'CARTERA' then
    raise exception 'Ese registro ya es %, no hay nada que convertir.', v_c.tipo_registro
      using errcode = 'check_violation';
  end if;

  if v_ruc = '' and v_actual ~ '^[0-9]{11}$' then v_ruc := v_actual; end if;
  if v_ruc !~ '^[0-9]{11}$' then
    raise exception 'Indica el RUC de la venta: 11 digitos. No se pudo deducir de %.', v_actual
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.clientes where ruc = v_ruc and customer_id <> v_actual) then
    raise exception 'Ya hay otra venta registrada con el RUC %.', v_ruc using errcode = 'unique_violation';
  end if;

  v_razon := nullif(btrim(coalesce(p_razon_social, v_c.nombre_comercio, '')), '');
  if v_razon is null then
    raise exception 'Una venta nueva necesita razon social y este registro no tiene nombre.'
      using errcode = 'check_violation';
  end if;

  v_nuevo := 'NUEVO-' || v_ruc;
  if exists (select 1 from public.clientes where customer_id = v_nuevo) then
    raise exception 'El Customer ID % ya esta en uso.', v_nuevo using errcode = 'unique_violation';
  end if;

  select count(*) into v_n from public.interacciones where customer_id = v_actual;

  -- Va en dos pasos y no en uno, y el motivo lo enseno la prueba: haciendolo
  -- junto, el trigger que vigila los cierres corre ANTES que el que aplica la
  -- conversion, y para entonces la fila ya llevaba la llave nueva mientras las
  -- gestiones seguian colgadas de la vieja. Veia un retenido sin ni una gestion
  -- efectiva y abortaba: 'No se puede cerrar como retenido un comercio sin
  -- ningun contacto logrado'. Tenia razon en lo que veia.
  --
  -- Paso 1 - el tipo, el RUC, la razon social y el resultado, con la llave
  -- quieta: el comercio sigue teniendo sus gestiones a la vista.
  perform set_config('app.convirtiendo_venta',
    jsonb_build_object('cid', v_actual, 'nuevo', v_actual, 'ruc', v_ruc, 'razon', v_razon)::text, true);
  update public.clientes set nombre_comercio = v_c.nombre_comercio where customer_id = v_actual;
  perform set_config('app.convirtiendo_venta', '', true);

  select * into v_leido from public.clientes where customer_id = v_actual;
  if v_leido.tipo_registro <> 'NUEVO' or v_leido.resultado_gestion <> 'VENTA'
     or v_leido.ruc is distinct from v_ruc then
    raise exception 'La conversion no se aplico: tipo=%, resultado=%, ruc=%.',
      v_leido.tipo_registro, coalesce(v_leido.resultado_gestion,'(nulo)'), coalesce(v_leido.ruc,'(nulo)');
  end if;

  -- Paso 2 - recien ahora la llave, con la fila ya convertida. Reusa el trigger
  -- de corregir_ruc, que es el que sabe renombrar sin que las reglas repongan.
  perform set_config('app.corrigiendo_customer_id', v_nuevo, true);
  perform set_config('app.corrigiendo_ruc', v_actual || '|' || v_ruc || '|' || v_nuevo, true);
  update public.clientes set customer_id = v_nuevo where customer_id = v_actual;

  select * into v_leido from public.clientes where customer_id = v_nuevo;
  if not found then
    raise exception 'El renombrado no se aplico: el comercio sigue como %.', v_actual;
  end if;

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    update public.interacciones set customer_id = v_nuevo where customer_id = v_actual;
  end if;

  perform set_config('app.corrigiendo_ruc', '', true);
  perform set_config('app.corrigiendo_customer_id', '', true);

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La conversion se cancelo: % de % gestiones no siguieron al comercio.',
      v_quedan, v_n using errcode = 'check_violation';
  end if;

  update public.auditoria set customer_id = v_nuevo where customer_id = v_actual;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio,
                               correo, ejecutivo, detalle)
  values ('clientes', 'editar', v_nuevo, v_nuevo, v_c.nombre_comercio, v_correo,
          (select coalesce(nombre_corto, nombre) from public.usuarios where correo = v_correo),
          jsonb_build_object(
            'tipo_registro',     jsonb_build_object('antes', 'CARTERA', 'despues', 'NUEVO'),
            'resultado_gestion', jsonb_build_object('antes', coalesce(v_c.resultado_gestion,'(sin dato)'),
                                                    'despues', 'VENTA'),
            'customer_id',       jsonb_build_object('antes', v_actual, 'despues', v_nuevo),
            'ruc',               jsonb_build_object('antes', '(sin dato)', 'despues', v_ruc),
            'razon_social',      jsonb_build_object('antes', '(sin dato)', 'despues', v_razon),
            'distrito',          jsonb_build_object('antes', coalesce(v_c.distrito,'(sin dato)'),  'despues', '(no aplica)'),
            'direccion',         jsonb_build_object('antes', coalesce(v_c.direccion,'(sin dato)'), 'despues', '(no aplica)'),
            'estado',            jsonb_build_object('antes', coalesce(v_c.estado,'(sin dato)'),    'despues', '(no aplica)'),
            '_arrastro',         v_n,
            '_nota',             'No era cartera de BBVA sino una venta que trajo Stratis. El distrito y la direccion se guardan aca porque una venta nueva no los admite: '
                              || coalesce(v_c.distrito,'(sin distrito)') || ' - ' || coalesce(v_c.direccion,'(sin direccion)')));

  return format('%s: CARTERA/%s -> NUEVO/VENTA, RUC %s (%s -> %s), con %s gestion(es). Se borro: %s / %s',
                v_c.nombre_comercio, coalesce(v_c.resultado_gestion,'?'), v_ruc, v_actual, v_nuevo, v_n,
                coalesce(v_c.distrito,'(sin distrito)'), coalesce(v_c.direccion,'(sin direccion)'));
end $function$
;

CREATE OR REPLACE FUNCTION public.corregir_customer_id(p_actual text, p_nuevo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actual  text := upper(trim(coalesce(p_actual, '')));
  v_nuevo   text := upper(trim(coalesce(p_nuevo, '')));
  v_nombre  text;
  v_tipo    text;
  v_duenio  text;
  v_correo  text := nullif(public.correo_actual(), '');
  v_n       int;
  v_ncitas  int;
  v_quedan  int;
begin
  if v_correo is null then
    raise exception 'Sesion no valida.' using errcode = 'check_violation';
  end if;
  if v_actual = '' or v_nuevo = '' then
    raise exception 'Indica el Customer ID actual y el correcto.' using errcode = 'check_violation';
  end if;

  select nombre_comercio, tipo_registro, asignado_correo
    into v_nombre, v_tipo, v_duenio
    from public.clientes where customer_id = v_actual for update;
  if v_nombre is null then
    raise exception 'No existe ningun comercio con el Customer ID %.', v_actual
      using errcode = 'check_violation';
  end if;

  -- Supervision cualquiera; el ejecutivo, lo suyo. La ventana de edicion NO
  -- gobierna esto: un identificador mal tecleado no mueve ningun indicador, y
  -- dejarlo mal en la base que se le entrega al banco es peor que corregirlo
  -- tarde. Quien lo hizo queda en la bitacora.
  if not public.es_admin() and v_duenio is distinct from v_correo then
    raise exception 'Solo puedes corregir el Customer ID de los comercios que tu registraste.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_actual = v_nuevo then
    raise exception 'El Customer ID nuevo es igual al actual.' using errcode = 'check_violation';
  end if;
  if length(v_nuevo) < 3 or length(v_nuevo) > 30 then
    raise exception 'El Customer ID debe tener entre 3 y 30 caracteres.' using errcode = 'check_violation';
  end if;
  if v_nuevo !~ '^[A-Z0-9._-]+$' then
    raise exception 'El Customer ID solo admite letras, numeros, punto, guion y guion bajo.'
      using errcode = 'check_violation';
  end if;
  if v_tipo <> 'CARTERA' then
    raise exception 'Una venta nueva se identifica por RUC, no por Customer ID.'
      using errcode = 'check_violation';
  end if;
  -- Once digitos es un RUC, y un RUC convierte la ficha en venta nueva sin que
  -- nadie lo haya pedido: el comercio saldria del portafolio de retencion y de
  -- todos sus indicadores. Una correccion no puede cambiar de que se trata.
  if v_nuevo ~ '^[0-9]{11}$' then
    raise exception 'Ese numero tiene forma de RUC. Un comercio de cartera no puede quedar identificado como venta nueva.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.clientes where customer_id = v_nuevo) then
    raise exception 'El Customer ID % ya esta en uso por otro comercio.', v_nuevo
      using errcode = 'unique_violation';
  end if;

  select count(*) into v_n      from public.interacciones where customer_id = v_actual;
  select count(*) into v_ncitas from public.seguimientos  where customer_id = v_actual;

  perform set_config('app.corrigiendo_customer_id', v_nuevo, true);
  update public.clientes set customer_id = v_nuevo where customer_id = v_actual;

  -- Que el padre se haya renombrado no se supone: se lee. Durante meses no se
  -- renombraba y el RPC igual devolvia un mensaje de exito.
  if not exists (select 1 from public.clientes where customer_id = v_nuevo) then
    raise exception 'La correccion no se aplico: el comercio sigue siendo %.', v_actual
      using errcode = 'check_violation';
  end if;

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    update public.interacciones set customer_id = v_nuevo where customer_id = v_actual;
  end if;
  select count(*) into v_quedan from public.seguimientos where customer_id = v_actual;
  if v_quedan > 0 then
    update public.seguimientos set customer_id = v_nuevo where customer_id = v_actual;
  end if;
  perform set_config('app.corrigiendo_customer_id', '', true);

  -- Se verifica lo que se movio, TODO: gestiones y citas. Antes solo se contaban
  -- las gestiones y una cita rezagada pasaba en silencio.
  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % gestiones no siguieron al comercio.',
      v_quedan, v_n using errcode = 'check_violation';
  end if;
  select count(*) into v_quedan from public.seguimientos where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % citas no siguieron al comercio.',
      v_quedan, v_ncitas using errcode = 'check_violation';
  end if;

  update public.auditoria set customer_id = v_nuevo where customer_id = v_actual;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio,
                               correo, ejecutivo, detalle)
  values ('clientes', 'editar', v_nuevo, v_nuevo, v_nombre, v_correo,
          (select coalesce(nombre_corto, nombre) from public.usuarios where correo = v_correo),
          jsonb_build_object('customer_id',
            jsonb_build_object('antes', v_actual, 'despues', v_nuevo),
            '_arrastro', v_n, '_citas', v_ncitas));

  return format('%s: %s -> %s, con %s gestion(es) y %s cita(s)',
                v_nombre, v_actual, v_nuevo, v_n, v_ncitas);
end $function$
;

CREATE OR REPLACE FUNCTION public.corregir_fecha_gestion(p_id uuid, p_fecha date, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old      public.interacciones%rowtype;
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_comercio text;
  v_nueva    date;
begin
  if not public.es_admin() then
    raise exception 'Solo el Analista y el Manager pueden corregir la fecha de una gestión.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_old from public.interacciones where id = p_id;
  if not found then
    raise exception 'No se encontró esa gestión.' using errcode = 'no_data_found';
  end if;

  if p_fecha is null then
    raise exception 'Indica la fecha correcta de la gestión.' using errcode = 'check_violation';
  end if;
  if p_fecha = v_old.fecha_contacto then
    raise exception 'La gestión ya está fechada el %.', to_char(p_fecha, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  if p_fecha > v_hoy then
    raise exception 'La fecha corregida (%) es posterior a hoy (%). Una gestión no puede quedar en el futuro.',
      to_char(p_fecha, 'DD/MM/YYYY'), to_char(v_hoy, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  -- Un año hacia atrás es margen de sobra para una campaña que arrancó en julio;
  -- más allá de eso es casi seguro otro error de tipeo, en sentido contrario.
  if p_fecha < v_hoy - 365 then
    raise exception 'La fecha corregida (%) es de hace más de un año. Revísala.',
      to_char(p_fecha, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  perform set_config('app.corrigiendo_fecha',
                     p_id::text || '|' || to_char(p_fecha, 'YYYY-MM-DD'), true);
  update public.interacciones set fecha_contacto = p_fecha where id = p_id;
  perform set_config('app.corrigiendo_fecha', '', true);

  select fecha_contacto into v_nueva from public.interacciones where id = p_id;
  if v_nueva is distinct from p_fecha then
    raise exception 'La corrección no se aplicó: la fecha quedó en %.', to_char(v_nueva,'DD/MM/YYYY');
  end if;

  select nombre_comercio into v_comercio from public.clientes where customer_id = v_old.customer_id;

  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('interacciones', 'editar', p_id::text, v_old.customer_id, v_comercio,
          public.correo_actual(), v_old.ejecutivo,
          jsonb_build_object(
            'fecha_contacto', jsonb_build_object(
              'antes',   to_char(v_old.fecha_contacto, 'DD/MM/YYYY'),
              'despues', to_char(p_fecha, 'DD/MM/YYYY')),
            '_nota', coalesce(nullif(trim(p_motivo), ''),
                              'Corrección de la fecha de la gestión')));

  return jsonb_build_object('ok', true,
                            'customer_id', v_old.customer_id,
                            'antes',   to_char(v_old.fecha_contacto, 'DD/MM/YYYY'),
                            'despues', to_char(p_fecha, 'DD/MM/YYYY'));
end $function$
;

CREATE OR REPLACE FUNCTION public.corregir_gestion(p_id uuid, p_tipo text, p_resultado text, p_hora time without time zone DEFAULT NULL::time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old   public.interacciones%rowtype;
  v_admin boolean := public.es_admin();
  v_mio   boolean;
  v_new   public.interacciones%rowtype;
begin
  select * into v_old from public.interacciones where id = p_id;
  if not found then
    raise exception 'No se encontró esa gestión.' using errcode = 'no_data_found';
  end if;

  v_mio := v_old.correo_stratis = public.correo_actual();
  if not (v_admin or v_mio) then
    raise exception 'Solo puedes corregir tus propias gestiones.'
      using errcode = 'insufficient_privilege';
  end if;

  -- La ventana no aplica a quien audita: si el Analista tiene que arreglar algo
  -- de la semana pasada, tiene que poder.
  if not v_admin and not public.gestion_editable(v_old.creado_en) then
    raise exception 'Esta gestión ya no se puede corregir: se registró el % y el plazo vence a la medianoche del día siguiente. Pídele la corrección a tu supervisor.',
      to_char(v_old.creado_en at time zone 'America/Lima', 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  if p_tipo is null or p_resultado is null then
    raise exception 'Indica el medio y el resultado.' using errcode = 'check_violation';
  end if;
  if p_tipo not in ('visita_presencial','reunion_presencial','reunion_virtual',
                    'videollamada','llamada','whatsapp','correo') then
    raise exception 'Medio de contacto desconocido: %', p_tipo using errcode = 'check_violation';
  end if;
  if p_resultado not in ('efectivo','no_contesta','local_cerrado','titular_ausente',
                         'datos_errados','rechazo') then
    raise exception 'Resultado desconocido: %', p_resultado using errcode = 'check_violation';
  end if;
  if p_hora is not null and not v_admin then
    raise exception 'Solo el Analista y el Manager pueden corregir la hora.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Convertir una gestión remota en presencial después del hecho sería fabricar
  -- una visita: la ubicación se captura en el momento y no se modifica jamás.
  if not v_admin and not public.edicion_libre()
     and p_tipo in ('visita_presencial','reunion_presencial')
     and p_tipo is distinct from v_old.tipo_contacto
     and v_old.ubicacion_verificada is not true then
    raise exception 'No puedes cambiar el medio a presencial: una visita se respalda con la ubicación capturada en el momento, y esa no se modifica. Elimina el registro y créalo de nuevo desde el local.'
      using errcode = 'check_violation';
  end if;

  if p_tipo = v_old.tipo_contacto and p_resultado = v_old.resultado
     and (p_hora is null or p_hora = v_old.hora_contacto) then
    raise exception 'No hay nada que corregir: el medio, el resultado y la hora son los mismos.'
      using errcode = 'check_violation';
  end if;

  -- La misma regla de siempre, aplicada al valor corregido: decir que el
  -- cliente respondió por correo o WhatsApp exige transcribir qué respondió.
  -- Se comprueba acá porque el trigger que la vigila corre antes que la
  -- corrección y vería todavía los valores viejos.
  if p_resultado = 'efectivo' and p_tipo in ('correo','whatsapp')
     and coalesce(trim(v_old.comentario_cliente), '') = '' then
    raise exception 'Si el cliente respondió por %, primero escribe en «Lo que dijo el cliente» qué respondió.',
      case p_tipo when 'correo' then 'correo' else 'WhatsApp' end
      using errcode = 'check_violation';
  end if;

  perform set_config('app.corrigiendo_gestion',
                     p_id::text || '|' || p_tipo || '|' || p_resultado || '|' ||
                     coalesce(to_char(p_hora, 'HH24:MI:SS'), ''), true);
  update public.interacciones
     set tipo_contacto = p_tipo, resultado = p_resultado
   where id = p_id;
  perform set_config('app.corrigiendo_gestion', '', true);

  select * into v_new from public.interacciones where id = p_id;
  if v_new.tipo_contacto is distinct from p_tipo
     or v_new.resultado is distinct from p_resultado then
    raise exception 'La corrección no se aplicó.';
  end if;

  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  select 'interacciones', 'editar', p_id::text, v_old.customer_id, c.nombre_comercio,
         public.correo_actual(), v_old.ejecutivo,
         (case when p_tipo is distinct from v_old.tipo_contacto
               then jsonb_build_object('tipo_contacto',
                      jsonb_build_object('antes', v_old.tipo_contacto, 'despues', p_tipo))
               else '{}'::jsonb end)
         ||
         (case when p_resultado is distinct from v_old.resultado
               then jsonb_build_object('resultado',
                      jsonb_build_object('antes', v_old.resultado, 'despues', p_resultado))
               else '{}'::jsonb end)
         ||
         (case when p_hora is not null and p_hora is distinct from v_old.hora_contacto
               then jsonb_build_object('hora_contacto',
                      jsonb_build_object('antes', to_char(v_old.hora_contacto,'HH24:MI'),
                                         'despues', to_char(p_hora,'HH24:MI')))
               else '{}'::jsonb end)
         || jsonb_build_object('_nota',
              case when v_admin and not v_mio
                   then 'Corrección hecha por supervisión'
                   else 'El ejecutivo corrigió su registro' end)
    from (select 1) t left join public.clientes c on c.customer_id = v_old.customer_id;

  return jsonb_build_object('ok', true,
    'medio_antes', v_old.tipo_contacto, 'medio_despues', p_tipo,
    'resultado_antes', v_old.resultado, 'resultado_despues', p_resultado,
    'cumple_visita', v_new.cumple_visita);
end $function$
;

CREATE OR REPLACE FUNCTION public.corregir_ruc(p_customer_id text, p_ruc text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo  text := nullif(public.correo_actual(), '');
  v_actual  text := trim(coalesce(p_customer_id, ''));
  v_ruc     text := trim(coalesce(p_ruc, ''));
  v_nuevo   text;
  v_c       public.clientes%rowtype;
  v_n       int;
  v_ncitas  int;
  v_quedan  int;
  v_leido   text;
begin
  if v_correo is null then
    raise exception 'Sesion no valida.' using errcode = 'check_violation';
  end if;

  select * into v_c from public.clientes where customer_id = v_actual for update;
  if not found then
    raise exception 'No existe ningun comercio con el Customer ID %.', v_actual
      using errcode = 'check_violation';
  end if;
  if v_c.tipo_registro <> 'NUEVO' then
    raise exception 'Solo las ventas nuevas llevan RUC. Un comercio de cartera se corrige con el Customer ID.'
      using errcode = 'check_violation';
  end if;

  -- Mismo criterio que el Customer ID: supervision cualquiera, el ejecutivo lo
  -- suyo. Antes esto era solo de supervision, y el dedazo lo descubre quien esta
  -- en la calle.
  if not public.es_admin() and v_c.asignado_correo is distinct from v_correo then
    raise exception 'Solo puedes corregir el RUC de las ventas que tu registraste.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC son 11 digitos, sin espacios ni guiones. Recibi: %', coalesce(nullif(v_ruc,''),'(vacio)')
      using errcode = 'check_violation';
  end if;
  if v_ruc = v_c.ruc then
    raise exception 'El RUC nuevo es igual al que ya tiene el registro.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.clientes where ruc = v_ruc and customer_id <> v_actual) then
    raise exception 'Ya hay otra venta registrada con el RUC %.', v_ruc using errcode = 'unique_violation';
  end if;

  v_nuevo := 'NUEVO-' || v_ruc;
  if exists (select 1 from public.clientes where customer_id = v_nuevo) then
    raise exception 'El Customer ID % ya esta en uso.', v_nuevo using errcode = 'unique_violation';
  end if;

  select count(*) into v_n      from public.interacciones where customer_id = v_actual;
  select count(*) into v_ncitas from public.seguimientos  where customer_id = v_actual;

  perform set_config('app.corrigiendo_customer_id', v_nuevo, true);
  perform set_config('app.corrigiendo_ruc', v_actual || '|' || v_ruc || '|' || v_nuevo, true);

  update public.clientes
     set customer_id = v_nuevo,
         ruc         = v_ruc
   where customer_id = v_actual;

  select ruc into v_leido from public.clientes where customer_id = v_nuevo;
  if v_leido is null then
    raise exception 'La correccion no se aplico: el comercio sigue como %.', v_actual;
  end if;
  if v_leido is distinct from v_ruc then
    raise exception 'La correccion no se aplico: el RUC quedo en %.', coalesce(v_leido, '(nulo)');
  end if;

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    update public.interacciones set customer_id = v_nuevo where customer_id = v_actual;
  end if;
  select count(*) into v_quedan from public.seguimientos where customer_id = v_actual;
  if v_quedan > 0 then
    update public.seguimientos set customer_id = v_nuevo where customer_id = v_actual;
  end if;

  perform set_config('app.corrigiendo_ruc', '', true);
  perform set_config('app.corrigiendo_customer_id', '', true);

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % gestiones no siguieron al comercio.',
      v_quedan, v_n using errcode = 'check_violation';
  end if;
  select count(*) into v_quedan from public.seguimientos where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % citas no siguieron al comercio.',
      v_quedan, v_ncitas using errcode = 'check_violation';
  end if;

  update public.auditoria set customer_id = v_nuevo where customer_id = v_actual;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio,
                               correo, ejecutivo, detalle)
  values ('clientes', 'editar', v_nuevo, v_nuevo, v_c.nombre_comercio, v_correo,
          (select coalesce(nombre_corto, nombre) from public.usuarios where correo = v_correo),
          jsonb_build_object(
            'ruc',         jsonb_build_object('antes', coalesce(v_c.ruc, '(sin dato)'), 'despues', v_ruc),
            'customer_id', jsonb_build_object('antes', v_actual, 'despues', v_nuevo),
            '_arrastro',   v_n, '_citas', v_ncitas));

  return format('%s: RUC %s -> %s (%s -> %s), con %s gestion(es) y %s cita(s)',
                v_c.nombre_comercio, coalesce(v_c.ruc,'(sin dato)'), v_ruc, v_actual, v_nuevo, v_n, v_ncitas);
end $function$
;

CREATE OR REPLACE FUNCTION public.correo_actual()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$function$
;

CREATE OR REPLACE FUNCTION public.crear_prospecto(p_ruc text, p_razon_social text, p_rubro text, p_rubro_otro text DEFAULT NULL::text, p_observacion text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_cid    text;
  v_ruc    text := regexp_replace(coalesce(p_ruc, ''), '[^0-9]', '', 'g');
begin
  if v_correo is null then
    raise exception 'No hay sesion: no se puede registrar un prospecto sin saber de quien es';
  end if;
  if length(v_ruc) <> 11 then
    raise exception 'El RUC debe tener 11 digitos y llego %', p_ruc;
  end if;
  if coalesce(btrim(p_razon_social), '') = '' then
    raise exception 'La razon social es obligatoria: BBVA la necesita para afiliarlo';
  end if;
  if exists (select 1 from public.clientes where ruc = v_ruc) then
    raise exception 'El RUC % ya esta registrado en la campana', v_ruc;
  end if;

  v_cid := 'NUEVO-' || v_ruc;

  insert into public.clientes (
    customer_id, tipo_registro, ruc, razon_social, nombre_comercio,
    rubro, rubro_otro, observacion, distrito, direccion, estado,
    resultado_gestion, asignado, asignado_correo)
  select v_cid, 'NUEVO', v_ruc, btrim(p_razon_social), btrim(p_razon_social),
         p_rubro, p_rubro_otro, nullif(btrim(coalesce(p_observacion, '')), ''),
         null, null, null, 'PENDIENTE', u.nombre, v_correo
    from public.usuarios u where u.correo = v_correo;

  if not found then
    raise exception 'El correo % no figura en usuarios', v_correo;
  end if;
  return v_cid;
end $function$
;

CREATE OR REPLACE FUNCTION public.crear_venta_nueva(p_ruc text, p_razon_social text, p_rubro text, p_rubro_otro text, p_tipo_contacto text, p_fecha date, p_hora time without time zone, p_evidencia_path text, p_comentario_ejecutivo text, p_comentario_cliente text DEFAULT NULL::text, p_calificacion text DEFAULT NULL::text, p_ubicacion text DEFAULT NULL::text, p_ubicacion_verificada boolean DEFAULT false, p_gasto_total numeric DEFAULT NULL::numeric, p_gastos_paths text[] DEFAULT '{}'::text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_correo text; v_nombre text; v_cid text;
begin
  v_correo := public.correo_actual();
  if v_correo is null then
    raise exception 'Sesion no valida.' using errcode = 'check_violation';
  end if;
  select coalesce(u.nombre_corto, u.nombre) into v_nombre
    from public.usuarios u
   where u.correo = v_correo and u.activo and u.rol = 'Ejecutivo';
  if v_nombre is null then
    raise exception 'Las ventas nuevas las registran los ejecutivos en campo.'
      using errcode = 'check_violation';
  end if;

  if p_tipo_contacto not in ('visita_presencial','reunion_presencial','reunion_virtual','videollamada') then
    raise exception 'Una venta nueva se cierra en una visita presencial o en una reunion virtual.'
      using errcode = 'check_violation';
  end if;

  -- La evidencia fotografica dejo de exigirse en agosto de 2026. El parametro
  -- se mantiene en la firma para no romper a nadie que siga mandandolo: si
  -- viene una ruta se guarda, y si no, no pasa nada.

  if coalesce(trim(p_comentario_ejecutivo), '') = '' then
    raise exception 'Falta el comentario del ejecutivo.' using errcode = 'check_violation';
  end if;

  insert into public.clientes(
    tipo_registro, ruc, razon_social, rubro, rubro_otro, nombre_comercio,
    asignado, asignado_correo)
  values ('NUEVO', p_ruc, p_razon_social, p_rubro, nullif(trim(p_rubro_otro),''), p_razon_social,
          v_nombre, v_correo)
  returning customer_id into v_cid;

  insert into public.interacciones(
    customer_id, correo_stratis, ejecutivo, fecha_contacto, hora_contacto,
    tipo_contacto, resultado, ubicacion, ubicacion_verificada, evidencia_path,
    gasto_total, gastos_paths, calificacion, comentario_ejecutivo, comentario_cliente)
  values (v_cid, v_correo, v_nombre, p_fecha, p_hora,
          p_tipo_contacto, 'efectivo', p_ubicacion, coalesce(p_ubicacion_verificada, false),
          nullif(trim(coalesce(p_evidencia_path, '')), ''),
          p_gasto_total, coalesce(p_gastos_paths, '{}'),
          nullif(p_calificacion,''), p_comentario_ejecutivo, nullif(trim(p_comentario_cliente),''));

  return v_cid;
end $function$
;

CREATE OR REPLACE FUNCTION public.desde_reglas_25()
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
AS $function$ select timestamptz '2026-08-23 00:00:00-05' $function$
;

CREATE OR REPLACE FUNCTION public.edicion_libre()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select now() < (valor)::timestamptz from public.config where clave = 'edicion_libre_hasta'),
    false);
$function$
;

CREATE OR REPLACE FUNCTION public.es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.usuarios
    where correo = public.correo_actual() and activo and rol in ('Analista','Manager')
  )
$function$
;

CREATE OR REPLACE FUNCTION public.es_ejecutivo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.usuarios
    where correo = public.correo_actual() and activo and rol = 'Ejecutivo'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.es_usuario_activo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.usuarios
    where correo = public.correo_actual() and activo
  )
$function$
;

CREATE OR REPLACE FUNCTION public.eximir_ubicacion(p_id uuid, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_r record; v_motivo text;
begin
  if not public.es_admin() then
    raise exception 'Solo el Analista o el Manager pueden eximir la ubicacion de una gestion.'
      using errcode = 'insufficient_privilege';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'Escribe por que esta gestion no puede tener coordenada. Sin motivo no se exime.'
      using errcode = 'check_violation';
  end if;

  select i.*, c.nombre_comercio into v_r
    from interacciones i join clientes c on c.customer_id = i.customer_id
   where i.id = p_id;
  if not found then
    raise exception 'No existe esa gestion.' using errcode = 'no_data_found';
  end if;

  if coalesce(v_r.ubicacion, '') <> '' or v_r.ubicacion_verificada then
    raise exception 'Esa gestion ya tiene ubicacion registrada: no hay nada que eximir.'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.eximiendo_ubicacion', p_id::text, true);
  update interacciones
     set ubicacion_exenta = true, ubicacion_exenta_motivo = v_motivo
   where id = p_id;

  insert into auditoria (tabla, accion, registro_id, customer_id, comercio,
                         correo, ejecutivo, detalle)
  values ('interacciones', 'editar', p_id::text, v_r.customer_id, v_r.nombre_comercio,
          public.correo_actual(),
          coalesce((select coalesce(nombre_corto, nombre) from usuarios
                     where correo = public.correo_actual()), 'sistema'),
          jsonb_build_object(
            '_nota', 'Gestion del ' || to_char(v_r.fecha_contacto, 'DD/MM/YYYY') ||
                     ' exenta de ubicacion. Motivo: ' || v_motivo,
            'ubicacion_exenta', jsonb_build_object('antes', 'no', 'despues', 'si')));

  return 'ok';
end $function$
;

CREATE OR REPLACE FUNCTION public.fijar_ubicacion(p_id uuid, p_ubicacion text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old   public.interacciones%rowtype;
  v_admin boolean := public.es_admin();
  v_txt   text := trim(coalesce(p_ubicacion, ''));
  v_lat   numeric;
  v_lng   numeric;
begin
  select * into v_old from public.interacciones where id = p_id;
  if not found then
    raise exception 'No se encontró esa gestión.' using errcode = 'no_data_found';
  end if;

  if not (v_admin or v_old.correo_stratis = public.correo_actual()) then
    raise exception 'Solo puedes corregir la ubicación de tus propias gestiones.'
      using errcode = 'insufficient_privilege';
  end if;
  if not public.edicion_libre() then
    raise exception 'La ventana de corrección está cerrada: la ubicación ya no se puede escribir.'
      using errcode = 'check_violation';
  end if;

  -- Formato «lat, lng». Se valida de verdad: una coordenada mal tecleada que
  -- entre igual es peor que no tener ninguna.
  if v_txt !~ '^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$' then
    raise exception 'Escribe la ubicación como latitud, longitud. Ejemplo: -12.0464, -77.0428'
      using errcode = 'check_violation';
  end if;
  v_lat := split_part(replace(v_txt, ' ', ''), ',', 1)::numeric;
  v_lng := split_part(replace(v_txt, ' ', ''), ',', 2)::numeric;
  if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
    raise exception 'Esas coordenadas no existen: la latitud va de -90 a 90 y la longitud de -180 a 180.'
      using errcode = 'check_violation';
  end if;
  -- La campaña es en Perú. Fuera de ese recuadro es casi seguro un dedazo,
  -- o coordenadas copiadas de otro lado.
  if v_lat < -19 or v_lat > 0.5 or v_lng < -82 or v_lng > -68 then
    raise exception 'Esas coordenadas caen fuera del Perú (%). Revísalas antes de guardarlas.', v_txt
      using errcode = 'check_violation';
  end if;

  v_txt := v_lat::text || ', ' || v_lng::text;

  perform set_config('app.anulando_ubicacion', p_id::text || '|' || v_txt, true);
  update public.interacciones set ubicacion = v_txt where id = p_id;
  perform set_config('app.anulando_ubicacion', '', true);

  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  select 'interacciones', 'editar', p_id::text, v_old.customer_id, c.nombre_comercio,
         public.correo_actual(), v_old.ejecutivo,
         jsonb_build_object(
           'ubicacion', jsonb_build_object(
             'antes',   coalesce(nullif(v_old.ubicacion, ''), '(sin dato)'),
             'despues', v_txt),
           '_nota', coalesce(nullif(trim(p_motivo), ''),
                             'Ubicación escrita a mano en la ventana de corrección; no cuenta como verificada por GPS'))
    from (select 1) t left join public.clientes c on c.customer_id = v_old.customer_id;

  return jsonb_build_object('ok', true, 'ubicacion', v_txt, 'verificada', false);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_anular_ubicacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_marca text := coalesce(current_setting('app.anulando_ubicacion', true), '');
begin
  if tg_op <> 'UPDATE' or v_marca = '' then return new; end if;
  if split_part(v_marca, '|', 1) is distinct from new.id::text then return new; end if;

  new.ubicacion            := split_part(v_marca, '|', 2);
  -- Nunca se marca como verificada: no la midio el equipo en el momento.
  new.ubicacion_verificada := false;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar_bono_param()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_antes jsonb;
begin
  if tg_op = 'UPDATE' then v_antes := old.valor; else v_antes := null; end if;
  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('bono_parametros', 'editar', null, null, 'Parametros del bono',
          coalesce(public.correo_actual(), 'sistema'),
          coalesce(public.correo_actual(), 'sistema'),
          jsonb_build_object(
            'vigente_desde', jsonb_build_object('antes', v_antes, 'despues', new.valor),
            '_nota', case when tg_op = 'INSERT'
                          then 'Nueva version de los parametros, vigente desde ' || new.vigente_desde
                          else 'Se corrigio la version vigente desde ' || new.vigente_desde end));
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar_canal_bbva()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.contacto_bbva, '') is distinct from coalesce(old.contacto_bbva, '') then
    insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                  correo, ejecutivo, detalle)
    values ('clientes', 'editar', new.customer_id, new.customer_id, new.nombre_comercio,
            public.correo_actual(),
            coalesce((select coalesce(nombre_corto, nombre) from public.usuarios
                       where correo = public.correo_actual()), 'sistema'),
            jsonb_build_object('contacto_bbva', jsonb_build_object(
              'antes',   coalesce(old.contacto_bbva, '(sin dato)'),
              'despues', coalesce(new.contacto_bbva, '(sin dato)'))));
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar_cierre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('periodos_cerrados',
          case when tg_op = 'INSERT' then 'editar' else 'eliminar' end,
          new.id, null, 'Periodo ' || new.periodo,
          coalesce(public.correo_actual(), 'sistema'),
          coalesce(public.correo_actual(), 'sistema'),
          jsonb_build_object(
            'periodo', jsonb_build_object('antes', null, 'despues', new.periodo),
            '_nota', case when tg_op = 'INSERT'
                          then 'Se sello el cierre del periodo ' || new.periodo
                          else 'Se anulo el cierre del periodo ' || new.periodo
                               || coalesce(' - ' || new.anulado_nota, '') end));
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_det jsonb := '{}'::jsonb; v_campos text[] := array[
  'nombre_comercio','rubro','distrito','direccion','estado','resultado_gestion',
  'razon_social','observacion','motivo_no_retencion',
  -- 42: la dirección para el mapa y su referencia también dejan rastro.
  'direccion_maps','referencia_maps'];
  v_k text; v_a text; v_d text; v_n int;
begin
  if tg_op = 'UPDATE' then
    foreach v_k in array v_campos loop
      v_a := to_jsonb(old) ->> v_k;
      v_d := to_jsonb(new) ->> v_k;
      if v_a is distinct from v_d then
        v_det := v_det || jsonb_build_object(v_k, jsonb_build_object('antes', v_a, 'despues', v_d));
      end if;
    end loop;
    if v_det = '{}'::jsonb then return new; end if;
  else
    select count(*) into v_n from public.interacciones where customer_id = old.customer_id;
    v_det := jsonb_build_object('_borrado', jsonb_build_object(
      'tipo',      case when old.tipo_registro = 'NUEVO' then 'venta nueva' else 'cartera' end,
      'llave',     case when old.tipo_registro = 'NUEVO' then 'RUC ' || coalesce(old.ruc,'') else 'ID ' || old.customer_id end,
      'nombre',    old.nombre_comercio,
      'rubro',     old.rubro,
      'distrito',  old.distrito,
      'estado',    old.estado,
      'cierre',    old.resultado_gestion,
      'gestiones', v_n));
  end if;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio, correo, ejecutivo, detalle)
  values ('clientes', case when tg_op='UPDATE' then 'editar' else 'eliminar' end,
          coalesce(old.customer_id, new.customer_id), coalesce(old.customer_id, new.customer_id),
          coalesce(old.nombre_comercio, new.nombre_comercio), public.correo_actual(),
          coalesce(old.asignado, new.asignado), v_det);
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar_fact_base()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' and old.monto = new.monto then return new; end if;
  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('facturacion_base', 'editar', null, null, 'Base de facturacion',
          coalesce(public.correo_actual(), 'sistema'), new.correo,
          jsonb_build_object(
            'monto', jsonb_build_object(
              'antes',   case when tg_op = 'UPDATE' then to_jsonb(old.monto) else null end,
              'despues', to_jsonb(new.monto)),
            '_nota', 'Base de facturacion de ' || new.correo));
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar_interaccion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_det jsonb := '{}'::jsonb; v_com text; v_cid text;
begin
  v_cid := coalesce(old.customer_id, new.customer_id);
  select nombre_comercio into v_com from public.clientes where customer_id = v_cid;

  if tg_op = 'UPDATE' then
    if old.comentario_ejecutivo is distinct from new.comentario_ejecutivo then
      v_det := v_det || jsonb_build_object('Comentario del ejecutivo',
        jsonb_build_object('antes', old.comentario_ejecutivo, 'despues', new.comentario_ejecutivo)); end if;
    if old.comentario_cliente is distinct from new.comentario_cliente then
      v_det := v_det || jsonb_build_object('Comentario del cliente',
        jsonb_build_object('antes', old.comentario_cliente, 'despues', new.comentario_cliente)); end if;
    if old.calificacion is distinct from new.calificacion then
      v_det := v_det || jsonb_build_object('Calificacion',
        jsonb_build_object('antes', old.calificacion, 'despues', new.calificacion)); end if;
    if old.gasto_total is distinct from new.gasto_total then
      v_det := v_det || jsonb_build_object('Monto de viáticos',
        jsonb_build_object('antes', old.gasto_total, 'despues', new.gasto_total)); end if;
    if old.gastos_paths is distinct from new.gastos_paths then
      v_det := v_det || jsonb_build_object('Comprobantes',
        jsonb_build_object('antes', coalesce(array_length(old.gastos_paths,1),0),
                           'despues', coalesce(array_length(new.gastos_paths,1),0))); end if;
    if v_det = '{}'::jsonb then return new; end if;
  else
    -- La foto de lo que se borró, para que la línea de la bitácora se explique sola.
    v_det := jsonb_build_object('_borrado', jsonb_build_object(
      'fecha',      to_char(old.fecha_contacto, 'DD/MM/YYYY'),
      'hora',       to_char(old.hora_contacto, 'HH24:MI'),
      'medio',      old.tipo_contacto,
      'resultado',  old.resultado,
      'cumple',     old.cumple_visita,
      'ubicacion',  case when old.ubicacion_verificada then 'con GPS' else 'sin GPS' end,
      'gasto',      old.gasto_total,
      'comentario', left(coalesce(old.comentario_ejecutivo,''), 140)));
  end if;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio, correo, ejecutivo, detalle)
  values ('interacciones', case when tg_op='UPDATE' then 'editar' else 'eliminar' end,
          coalesce(old.id::text, new.id::text), v_cid, v_com, public.correo_actual(),
          coalesce(old.ejecutivo, new.ejecutivo), v_det);
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar_reporte()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.valor is not distinct from new.valor then return new; end if;
    v_antes := old.valor;
  end if;
  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('reporte_config', 'editar', null, null, 'Reporte de avance',
          coalesce(public.correo_actual(), 'sistema'),
          coalesce(public.correo_actual(), 'sistema'),
          jsonb_build_object(
            new.clave, jsonb_build_object('antes', v_antes, 'despues', new.valor),
            '_nota', case when tg_op = 'INSERT'
                          then 'Se cargó el bloque «' || new.clave || '» del reporte'
                          else 'Se editó el bloque «' || new.clave || '» del reporte' end));
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_bono_param_sello()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' then
    new.vigente_desde := old.vigente_desde;
    new.creado_en     := old.creado_en;
    new.creado_por    := old.creado_por;
  else
    new.creado_en  := now();
    new.creado_por := coalesce(public.correo_actual(), new.creado_por);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_cerrar_seguimiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.seguimientos
     set cerrado_en = now(), cerrado_por = new.correo_stratis,
         cerrado_motivo = coalesce(cerrado_motivo, 'GESTION')
   where customer_id = new.customer_id
     and cerrado_en is null
     and modalidad is null
     and (interaccion_id is null or interaccion_id <> new.id);

  if coalesce(new.visita_presencial, 'No') = 'SI'
     or coalesce(new.visita_virtual, 'No') = 'SI' then
    update public.seguimientos
       set cerrado_en = now(), cerrado_por = new.correo_stratis,
           cerrado_motivo = 'CUMPLIDA', interaccion_cumple = new.id
     where customer_id = new.customer_id
       and cerrado_en is null
       and modalidad is not null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_cerrar_seguimiento_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.resultado_gestion,'PENDIENTE') <> 'PENDIENTE'
     and coalesce(old.resultado_gestion,'PENDIENTE') = 'PENDIENTE' then
    update public.seguimientos
       set cerrado_en = now(), cerrado_por = public.correo_actual(),
           cerrado_motivo = coalesce(cerrado_motivo, 'CIERRE')
     where customer_id = new.customer_id and cerrado_en is null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_cierre_no_futuro()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if tg_op = 'UPDATE' and new.cerrado_en is not distinct from old.cerrado_en then
    return new;
  end if;

  if new.cerrado_en is not null
     and (new.cerrado_en at time zone 'America/Lima')::date > v_hoy then
    raise exception 'La fecha de cierre (%) es posterior a hoy (%). Un comercio no se puede cerrar en una fecha que aún no llega.',
      to_char((new.cerrado_en at time zone 'America/Lima')::date, 'DD/MM/YYYY'),
      to_char(v_hoy, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_cierre_sello()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    new.cerrado_en  := now();
    new.cerrado_por := coalesce(public.correo_actual(), new.cerrado_por);
    new.anulado_en  := null;
    new.anulado_por := null;
  else
    new.periodo     := old.periodo;
    new.foto        := old.foto;
    new.cerrado_en  := old.cerrado_en;
    new.cerrado_por := old.cerrado_por;
    if old.anulado_en is not null then
      raise exception 'Este cierre ya estaba anulado el %', old.anulado_en using errcode = 'check_violation';
    end if;
    if new.anulado_en is null then
      raise exception 'De un cierre sellado solo se puede anular. Para volver a cerrar el periodo, anula este y sella uno nuevo.' using errcode = 'check_violation';
    end if;
    new.anulado_en  := now();
    new.anulado_por := coalesce(public.correo_actual(), new.anulado_por);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_cierre_sin_respaldo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.clientes c
     set resultado_gestion = 'PENDIENTE'
   where c.customer_id = old.customer_id
     and c.tipo_registro = 'CARTERA'
     and c.resultado_gestion in ('RETENIDO','VENTA')
     and not exists (select 1 from public.interacciones i
                      where i.customer_id = old.customer_id and i.resultado = 'efectivo');
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_contacto_bbva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.contacto_bbva := nullif(upper(trim(coalesce(new.contacto_bbva, ''))), '');

  if coalesce(new.tipo_registro, 'CARTERA') = 'NUEVO' then
    new.contacto_bbva := null;
    return new;
  end if;

  if tg_op = 'INSERT' and new.contacto_bbva is null then
    raise exception 'Indica cómo se contactó al ejecutivo de BBVA para confirmar los datos de este comercio: correo, llamada, WhatsApp, visita a sus oficinas o chat del banco.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.contacto_bbva is null then
    new.contacto_bbva := old.contacto_bbva;   -- no se borra lo que ya estaba
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_convertir_venta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_marca text := coalesce(current_setting('app.convirtiendo_venta', true), '');
  j jsonb;
begin
  if tg_op <> 'UPDATE' or v_marca = '' then return new; end if;
  j := v_marca::jsonb;
  if (j->>'cid') is distinct from old.customer_id then return new; end if;
  new.customer_id       := j->>'nuevo';
  new.tipo_registro     := 'NUEVO';
  new.ruc               := j->>'ruc';
  new.razon_social      := j->>'razon';
  new.resultado_gestion := 'VENTA';
  new.distrito          := null;
  new.direccion         := null;
  new.estado            := null;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_coordinacion_inicial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.tipo_registro <> 'CARTERA' or new.contacto_bbva is null then
    return null;
  end if;
  if exists (select 1 from public.interacciones
              where customer_id = new.customer_id and con = 'BBVA') then
    return null;
  end if;

  insert into public.interacciones
    (customer_id, correo_stratis, ejecutivo, fecha_contacto, hora_contacto,
     con, tipo_contacto, resultado, proposito, inferida,
     comentario_ejecutivo, comentario_cliente)
  values (new.customer_id, new.asignado_correo, new.asignado,
          (coalesce(new.creado_en, now()) at time zone 'America/Lima')::date,
          '09:00'::time, 'BBVA',
          case new.contacto_bbva
            when 'CORREO'   then 'bbva_correo'
            when 'LLAMADA'  then 'bbva_llamada'
            when 'WHATSAPP' then 'bbva_whatsapp'
            when 'VISITA'   then 'bbva_presencial'
            when 'CHAT'     then 'bbva_chat'
          end,
          'bbva_sin_respuesta', 'primer_contacto', true,
          'Primer contacto tomado del alta del comercio: es el medio que el ejecutivo declaro al registrarlo. Si el banco ya respondio, registralo como la interaccion siguiente.',
          null);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_corregir_ruc()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_marca text := coalesce(current_setting('app.corrigiendo_ruc', true), '');
begin
  if tg_op <> 'UPDATE' or v_marca = '' then return new; end if;
  if split_part(v_marca, '|', 1) is distinct from old.customer_id then return new; end if;
  -- Corre al final: lo que escriba aca ya no lo repone nadie.
  new.ruc         := split_part(v_marca, '|', 2);
  new.customer_id := split_part(v_marca, '|', 3);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_fact_base_sello()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.actualizado_en  := now();
  new.actualizado_por := coalesce(public.correo_actual(), new.actualizado_por);
  if tg_op = 'UPDATE' then new.correo := old.correo; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_facturacion_sello()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.actualizado_en  := now();
  new.actualizado_por := coalesce(public.correo_actual(), new.actualizado_por);
  if tg_op = 'UPDATE' then
    new.periodo := old.periodo;
    new.correo  := old.correo;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_fecha_no_futura()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  -- En un UPDATE solo se revisa si la fecha cambió. Las dos gestiones que ya
  -- entraron con fecha futura antes de esta regla quedarían inmodificables si
  -- no, y no se podría ni corregirles el comentario ni la calificación.
  if tg_op = 'UPDATE' and new.fecha_contacto = old.fecha_contacto then
    return new;
  end if;

  if new.fecha_contacto > v_hoy then
    raise exception 'La fecha del contacto (%) es posterior a hoy (%). Una gestión se registra el día que ocurrió o después, nunca antes. Si estás poniendo al día algo de días pasados, elige esa fecha; si te equivocaste de mes, corrígela.',
      to_char(new.fecha_contacto, 'DD/MM/YYYY'),
      to_char(v_hoy, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_llave_inmutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.customer_id is distinct from old.customer_id
     and coalesce(current_setting('app.corrigiendo_customer_id', true), '') is distinct from new.customer_id then
    raise exception 'El Customer ID no se edita a mano: se corrige desde la ficha del comercio, con el boton Corregir.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_normalizar_periodo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.periodo := date_trunc('month', new.periodo)::date;
  new.actualizado_en := now();
  if tg_op = 'INSERT' then
    new.actualizado_por := coalesce(nullif(public.correo_actual(),''), new.actualizado_por);
  else
    new.actualizado_por := coalesce(nullif(public.correo_actual(),''), old.actualizado_por);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_perdido_con_motivo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.resultado_gestion = 'PERDIDO'
     and (tg_op = 'INSERT' or old.resultado_gestion is distinct from 'PERDIDO')
     and coalesce(trim(new.motivo_no_retencion), '') = '' then
    raise exception 'Para cerrar como perdido hay que indicar por que no se retuvo.'
      using errcode = 'check_violation';
  end if;
  -- Si deja de estar perdido, el motivo ya no aplica.
  if new.resultado_gestion is distinct from 'PERDIDO' then
    new.motivo_no_retencion := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_reglas_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_logrado boolean;
  v_corrigiendo text := coalesce(current_setting('app.corrigiendo_customer_id', true), '');
begin
  new.tipo_registro := coalesce(new.tipo_registro, 'CARTERA');

  if new.tipo_registro = 'NUEVO' then
    new.ruc          := regexp_replace(coalesce(new.ruc,''), '[^0-9]', '', 'g');
    new.customer_id  := 'NUEVO-' || new.ruc;
    new.razon_social := nullif(trim(new.razon_social), '');
    new.distrito     := null;
    new.direccion    := null;
    new.estado       := null;
    new.observacion  := null;
    new.resultado_gestion := coalesce(nullif(btrim(new.resultado_gestion), ''), 'PENDIENTE');
    new.nombre_comercio := coalesce(nullif(trim(new.nombre_comercio), ''), new.razon_social);
  else
    new.customer_id  := upper(trim(new.customer_id));
    new.distrito     := upper(trim(new.distrito));
    new.estado       := coalesce(new.estado, 'ACTIVO');
    new.ruc          := null;
    new.razon_social := null;

    if new.resultado_gestion in ('RETENIDO','VENTA') then
      select exists (
        select 1 from public.interacciones i
         where i.customer_id = new.customer_id and i.resultado = 'efectivo'
      ) into v_logrado;
      if not v_logrado then
        raise exception 'No se puede cerrar como % un comercio sin ningun contacto logrado. Registra primero la gestion en la que hablaste con el titular.',
          lower(new.resultado_gestion) using errcode = 'check_violation';
      end if;
    end if;

    if new.resultado_gestion = 'RETENIDO' and new.estado <> 'ACTIVO' then
      raise exception 'Un comercio dado de baja no puede quedar como retenido: si lo recuperaste marcalo como venta, y si no, no hay retencion que contar.'
        using errcode = 'check_violation';
    end if;
    if new.resultado_gestion = 'VENTA' and new.estado <> 'DE BAJA' then
      raise exception 'Venta es la recuperacion de un comercio que estaba dado de baja. Si el comercio figura activo y se queda con BBVA, eso es una retencion.'
        using errcode = 'check_violation';
    end if;
  end if;

  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.asignado_correo := public.correo_actual();
      select coalesce(u.nombre_corto, u.nombre) into new.asignado
        from public.usuarios u where u.correo = new.asignado_correo;
    else
      new.asignado_correo := old.asignado_correo;
      new.asignado        := old.asignado;
      -- La llave no se edita... salvo cuando quien la cambia es el RPC de
      -- correccion, que deja su marca en la sesion. Sin marca, la regla de
      -- siempre. Es la misma puerta que ya tienen interacciones y seguimientos.
      if not (v_corrigiendo <> '' and new.customer_id = v_corrigiendo) then
        new.customer_id   := old.customer_id;
      end if;
      new.tipo_registro   := old.tipo_registro;
      new.ruc             := old.ruc;
      new.creado_en       := old.creado_en;
    end if;
  end if;

  if new.rubro <> 'otro' then new.rubro_otro := null; end if;
  new.modificado_en := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_reglas_interaccion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_presencial boolean;
  v_virtual    boolean;
  v_respaldada boolean;
begin
  if tg_op = 'UPDATE' then
    new.customer_id          := old.customer_id;
    new.correo_stratis       := old.correo_stratis;
    new.ejecutivo            := old.ejecutivo;
    new.fecha_contacto       := old.fecha_contacto;
    new.hora_contacto        := old.hora_contacto;
    new.tipo_contacto        := old.tipo_contacto;
    new.resultado            := old.resultado;
    new.ubicacion            := old.ubicacion;
    new.ubicacion_verificada := old.ubicacion_verificada;
    new.evidencia_path       := old.evidencia_path;
    new.creado_en            := old.creado_en;
  end if;

  v_presencial := new.tipo_contacto in ('visita_presencial','reunion_presencial');
  v_virtual    := new.tipo_contacto in ('reunion_virtual','videollamada');

  new.visita_presencial := case when v_presencial then 'SI' else 'No' end;
  new.visita_virtual    := case when v_virtual    then 'SI' else 'No' end;

  v_respaldada := coalesce(new.ubicacion_verificada, false)
               or coalesce(new.ubicacion_exenta, false);

  new.cumple_visita := case
    when not (v_presencial or v_virtual)  then 'No'
    when new.resultado <> 'efectivo'      then 'No'
    when v_presencial
         and coalesce(new.creado_en, now()) >= public.desde_reglas_25()
         and not v_respaldada              then 'No'
    else 'SI'
  end;

  new.fecha_visita_actualizada :=
    case when new.cumple_visita = 'SI' then new.fecha_contacto else null end;

  if tg_op = 'INSERT' and auth.role() = 'authenticated' then
    new.correo_stratis := public.correo_actual();
  end if;

  new.modificado_en := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_reglas_seguimiento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if public.correo_actual() is not null then
      new.correo_stratis := public.correo_actual();
      new.ejecutivo := coalesce(
        (select coalesce(nombre_corto, nombre) from public.usuarios
          where correo = new.correo_stratis), new.ejecutivo);
    end if;
    if new.fecha_objetivo < (now() at time zone 'America/Lima')::date then
      raise exception 'La cita no puede quedar en el pasado. Si la visita ya ocurrio, registrala como gestion.'
        using errcode = 'check_violation';
    end if;
    if new.fecha_objetivo > (now() at time zone 'America/Lima')::date + 180 then
      raise exception 'Esa fecha esta a mas de seis meses. Revisala.'
        using errcode = 'check_violation';
    end if;
    if new.modalidad is not null and new.duracion_min is null then
      new.duracion_min := case when new.modalidad = 'VIRTUAL' then 30 else 60 end;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.customer_id    := old.customer_id;
    new.correo_stratis := old.correo_stratis;
    new.creado_en      := old.creado_en;
    new.historial      := coalesce(old.historial, '[]'::jsonb);

    if new.cerrado_en is not null and old.cerrado_en is null then
      new.cerrado_por := coalesce(new.cerrado_por, public.correo_actual());
      new.cerrado_motivo := coalesce(new.cerrado_motivo, 'DESCARTADA');
    end if;

    if new.modalidad is not null
       and (new.fecha_objetivo is distinct from old.fecha_objetivo
            or new.hora_inicio is distinct from old.hora_inicio) then

      if new.fecha_objetivo < (now() at time zone 'America/Lima')::date
         and not public.es_admin() then
        raise exception 'No se puede reagendar hacia atras. Si la visita ya ocurrio, registrala como gestion.'
          using errcode = 'check_violation';
      end if;
      if new.fecha_objetivo > (now() at time zone 'America/Lima')::date + 180 then
        raise exception 'Esa fecha esta a mas de seis meses. Revisala.'
          using errcode = 'check_violation';
      end if;

      new.historial := new.historial || jsonb_build_object(
        'fecha',      old.fecha_objetivo,
        'hora',       old.hora_inicio,
        'movida_en',  now(),
        'movida_por', public.correo_actual());
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_reporte_sello()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.actualizado_en  := now();
  new.actualizado_por := coalesce(public.correo_actual(), new.actualizado_por);
  if tg_op = 'UPDATE' then
    new.clave := old.clave;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_respuesta_con_prueba()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.resultado = 'efectivo'
     and coalesce(new.destinatario, 'cliente') = 'cliente'
     and coalesce(trim(new.comentario_cliente), '') = ''
  then
    if coalesce(new.creado_en, now()) >= public.desde_reglas_25()
       or new.tipo_contacto in ('correo','whatsapp')
    then
      raise exception 'Marcaste que el cliente respondio. Escribe en "Lo que dijo el cliente" que respondio: es lo que separa una conversacion de un mensaje enviado. Si todavia no contesta, el resultado es "No respondio".';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_restaurar_fecha_corregida()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_marca  text := coalesce(current_setting('app.corrigiendo_fecha', true), '');
  v_id     text;
  v_fecha  text;
begin
  if tg_op <> 'UPDATE' or v_marca = '' then return new; end if;

  v_id    := split_part(v_marca, '|', 1);
  v_fecha := split_part(v_marca, '|', 2);
  if v_id is distinct from new.id::text then return new; end if;

  new.fecha_contacto := v_fecha::date;
  -- La fecha de la visita se deriva de la del contacto: si no se recalcula acá,
  -- queda apuntando al día equivocado.
  new.fecha_visita_actualizada :=
    case when new.cumple_visita = 'SI' then new.fecha_contacto else null end;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_restaurar_gestion_corregida()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_marca text := coalesce(current_setting('app.corrigiendo_gestion', true), '');
  v_pres  boolean;
  v_virt  boolean;
begin
  if tg_op <> 'UPDATE' or v_marca = '' then return new; end if;
  if split_part(v_marca, '|', 1) is distinct from new.id::text then return new; end if;

  new.tipo_contacto := split_part(v_marca, '|', 2);
  new.resultado     := split_part(v_marca, '|', 3);
  -- La hora solo la mueve supervisión, y solo si vino en la marca.
  if nullif(split_part(v_marca, '|', 4), '') is not null then
    new.hora_contacto := split_part(v_marca, '|', 4)::time;
  end if;

  -- Lo derivado se recalcula acá porque las reglas ya corrieron con los valores viejos.
  v_pres := new.tipo_contacto in ('visita_presencial','reunion_presencial');
  v_virt := new.tipo_contacto in ('reunion_virtual','videollamada');
  new.visita_presencial := case when v_pres then 'SI' else 'No' end;
  new.visita_virtual    := case when v_virt then 'SI' else 'No' end;
  new.cumple_visita     := case when (v_pres or v_virt) and new.resultado = 'efectivo'
                                then 'SI' else 'No' end;
  new.fecha_visita_actualizada :=
    case when new.cumple_visita = 'SI' then new.fecha_contacto else null end;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_sellar_cierre()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.resultado_gestion,'PENDIENTE') <> 'PENDIENTE' then
      new.cerrado_en := now();
    end if;
    return new;
  end if;

  if new.resultado_gestion is distinct from old.resultado_gestion then
    if coalesce(new.resultado_gestion,'PENDIENTE') = 'PENDIENTE' then
      new.cerrado_en := null;                       -- se reabrio: deja de contar
    elsif old.cerrado_en is null then
      new.cerrado_en := now();                      -- primer cierre
    end if;
    -- Si ya estaba cerrado y solo cambia de Retenido a Venta (o al reves), la
    -- fecha original se respeta: el mes en que se decidio no cambia.
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_solo_equipo_stratis()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.usuarios
                  where correo = lower(new.email) and activo) then
    raise exception 'Este correo no pertenece al equipo de la campaña.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_ubicacion_exenta_solo_rpc()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE'
     and new.ubicacion_exenta is distinct from old.ubicacion_exenta
     and coalesce(current_setting('app.eximiendo_ubicacion', true), '') <> new.id::text then
    new.ubicacion_exenta        := old.ubicacion_exenta;
    new.ubicacion_exenta_motivo := old.ubicacion_exenta_motivo;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_vinculo_mismo_ejecutivo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_a text;
  v_b text;
begin
  if new.anulado_en is not null then return new; end if;
  select asignado_correo into v_a from public.clientes where customer_id = new.customer_id_a;
  select asignado_correo into v_b from public.clientes where customer_id = new.customer_id_b;
  if v_a is distinct from v_b then
    raise exception 'Los dos comercios están asignados a personas distintas (% y %). Un vínculo entre ellos le acreditaría a una el trabajo de la otra.', coalesce(v_a,'sin asignar'), coalesce(v_b,'sin asignar');
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gestion_editable(p_creado_en timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.edicion_libre()
      or ((now() at time zone 'America/Lima')::date
          - (p_creado_en at time zone 'America/Lima')::date) <= 1;
$function$
;

CREATE OR REPLACE FUNCTION public.pulso()
 RETURNS TABLE(comercios bigint, gestiones bigint, ultimo timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    (select count(*) from public.clientes),
    (select count(*) from public.interacciones),
    greatest(
      coalesce((select max(greatest(c.creado_en, coalesce(c.modificado_en, c.creado_en)))
                  from public.clientes c), 'epoch'::timestamptz),
      coalesce((select max(greatest(i.creado_en, coalesce(i.modificado_en, i.creado_en)))
                  from public.interacciones i), 'epoch'::timestamptz)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.v2_actividad(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, visitado_en timestamp with time zone, recibido_en timestamp with time zone, correo text, ejecutivo text, customer_id text, comercio text, distrito text, direccion text, ruta text, con text, que text, motivo text, decision text, equipo text, fecha_reagenda date, comentario text, comentario_editado_en timestamp with time zone, editado_en timestamp with time zone, lat double precision, lng double precision, precision_m numeric, distancia_m integer, geo_calidad text, estado_anul text, anul_motivo text, anul_nota text, anul_pedida_por text, puede_editar boolean, limite_edicion date, es_mia boolean, validacion text, validacion_en timestamp with time zone, validacion_por text, validacion_motivo text, validacion_nota text, periodo text, razon_social text, ruc text, terminales integer, tasa_debito numeric, tasa_credito numeric, orden integer, geo_lat double precision, geo_lng double precision, anul_pedida_en timestamp with time zone, resultado_editado_en timestamp with time zone, ref_lat double precision, ref_lng double precision, ref_calidad text, ref_nota text, direccion_ok boolean, plazo_hasta date, fuera_plazo boolean, ubicacion_editada_en timestamp with time zone, feedback text[], feedback_nota text, motivos_si text[], comercio_ubicado boolean, direccion_nueva text, fb_acciones text[], fb_extra jsonb, comentario_voz text, ia_propuesta jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (
    select coalesce(p_desde, (now() at time zone 'America/Lima')::date) d1,
           coalesce(p_hasta, p_desde, (now() at time zone 'America/Lima')::date) d2
  ),
  yo as (select public.correo_actual() c, public.es_admin() adm, (now() at time zone 'America/Lima')::date hoy)
  select v.id, v.visitado_en, v.recibido_en,
         v.correo, coalesce(u.nombre_corto, u.nombre, v.correo),
         c.customer_id, coalesce(nullif(btrim(c.nombre_comercial), ''), c.razon_social),
         c.distrito, coalesce(nullif(btrim(c.direccion_corregida), ''), c.direccion), a.ruta,
         v.con, v.que, v.motivo, v.decision, v.equipo, v.fecha_reagenda,
         v.comentario, v.comentario_editado_en,
         greatest(v.comentario_editado_en, v.resultado_editado_en),
         v.lat, v.lng, v.precision_m, v.distancia_m, c.geo_calidad,
         case when v.anulada_en is not null then 'anulada'
              when v.anul_pedida_en is not null and v.anul_resuelta_en is null then 'pendiente'
              when v.anul_resuelta_en is not null then 'rechazada'
              else 'activa' end,
         coalesce(v.anulada_motivo, v.anul_pedida_motivo), v.anul_resuelta_nota, v.anul_pedida_por,
         v.anulada_en is null and (yo.adm or (v.correo = yo.c and yo.hoy <= lim.d)),
         lim.d,
         v.correo = yo.c,
         v.validacion, v.validacion_en, v.validacion_por, v.validacion_motivo, v.validacion_nota,
         v.periodo, c.razon_social, c.ruc, c.terminales, c.tasa_debito, c.tasa_credito, a.orden,
         c.geo_lat, c.geo_lng, v.anul_pedida_en, v.resultado_editado_en,
         v.ref_lat, v.ref_lng, v.ref_calidad, v.ref_nota, v.direccion_ok,
         v.plazo_hasta, v.fuera_plazo, v.ubicacion_editada_en, v.feedback, v.feedback_nota, v.motivos_si,
         v.comercio_ubicado, v.direccion_nueva, v.fb_acciones, v.fb_extra, v.comentario_voz, v.ia_propuesta
  from v2_visitas v
  join v2_comercios c on c.customer_id = v.customer_id
  left join usuarios u on u.correo = v.correo
  left join v2_asignaciones a on a.customer_id = v.customer_id and a.periodo = v.periodo
  cross join r cross join yo
  cross join lateral (select public.v2_limite_habil((v.visitado_en at time zone 'America/Lima')::date, 2) d) lim
  where (v.visitado_en at time zone 'America/Lima')::date between r.d1 and r.d2
    and (yo.adm or v.correo = yo.c)
  order by v.visitado_en desc
$function$
;

CREATE OR REPLACE FUNCTION public.v2_actualizar_ubicacion(p_visita_id uuid, p_lat double precision, p_lng double precision, p_precision numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual(); v_admin boolean := public.es_admin();
  v record; v_limite date; v_ref_lat double precision; v_ref_lng double precision; v_dist integer; v_antes text; v_despues text;
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'La ubicación no es válida.'; end if;
  select * into v from v2_visitas where id = p_visita_id and anulada_en is null for update;
  if v.id is null then raise exception 'Esa visita no existe o está anulada.'; end if;
  if not v_admin and v.correo <> v_correo then raise exception 'Solo puedes actualizar la ubicación de tus propias visitas.'; end if;
  if not v_admin then
    v_limite := public.v2_limite_habil((v.visitado_en at time zone 'America/Lima')::date, 2);
    if (now() at time zone 'America/Lima')::date > v_limite then
      raise exception 'El plazo para corregir esta visita venció el %.', to_char(v_limite, 'DD/MM');
    end if;
  end if;

  v_ref_lat := v.ref_lat; v_ref_lng := v.ref_lng;
  if v_ref_lat is null then select geo_lat, geo_lng into v_ref_lat, v_ref_lng from v2_comercios where customer_id = v.customer_id; end if;
  v_dist := public.v2_metros(p_lat, p_lng, v_ref_lat, v_ref_lng);

  v_antes := case when v.lat is null then 'sin ubicación'
                  else round(v.lat::numeric, 6) || ', ' || round(v.lng::numeric, 6) || ' ±' || coalesce(round(v.precision_m)::text, '?') || ' m'
                       || coalesce(' · a ' || v.distancia_m || ' m del comercio', '') end;
  v_despues := round(p_lat::numeric, 6) || ', ' || round(p_lng::numeric, 6) || ' ±' || coalesce(round(p_precision)::text, '?') || ' m'
               || coalesce(' · a ' || v_dist || ' m del comercio', '');

  update v2_visitas set lat = p_lat, lng = p_lng, precision_m = p_precision, distancia_m = v_dist,
         ubicacion_editada_en = now(), ubicacion_editada_por = v_correo
   where id = p_visita_id;

  update v2_comercios set geo_lat = p_lat, geo_lng = p_lng, geo_en = now(),
         geo_detalle = coalesce(geo_detalle, '') || ' · ubicación actualizada por el ejecutivo el ' || to_char(now() at time zone 'America/Lima', 'DD/MM HH24:MI')
   where customer_id = v.customer_id and geo_visita_id = p_visita_id and coalesce(p_precision, 999) <= 60;

  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues) values (p_visita_id, 'ubicacion', v_correo, v_antes, v_despues);
  return jsonb_build_object('distancia_m', v_dist, 'antes', v_antes, 'despues', v_despues);
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_anular_visita(p_visita_id uuid, p_motivo text, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')),''); v_nota text := nullif(btrim(coalesce(p_nota,'')),'');
  v_anulada timestamptz; v_pedida timestamptz; v_existe boolean;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista anula visitas.'; end if;
  if v_motivo is null then raise exception 'Indica el motivo de la anulación.'; end if;
  select true, anulada_en, anul_pedida_en into v_existe, v_anulada, v_pedida from v2_visitas where id = p_visita_id for update;
  if v_existe is null then raise exception 'Esa visita no existe.'; end if;
  if v_anulada is not null then raise exception 'Esa visita ya está anulada.'; end if;

  update v2_visitas
     set anulada_en = now(), anulada_por = v_correo, anulada_motivo = v_motivo || coalesce(' · ' || v_nota, ''),
         anul_resuelta_en = case when v_pedida is not null and anul_resuelta_en is null then now() else anul_resuelta_en end,
         anul_resuelta_por = case when v_pedida is not null and anul_resuelta_por is null then v_correo else anul_resuelta_por end,
         anul_resuelta_nota = case when v_pedida is not null and anul_resuelta_nota is null then coalesce(v_nota, v_motivo) else anul_resuelta_nota end
   where id = p_visita_id;
  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (p_visita_id, 'anulada', v_correo, null, v_motivo || coalesce(' · ' || v_nota, ''));
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_avance(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(correo text, nombre text, rol text, base integer, visitados integer, reactivados integer, conversion numeric, cumpl_visitas numeric, cumpl_reactivados numeric, cumpl_conversion numeric, puntos numeric, bono_pct numeric, bono_pagado numeric, bono_retenido numeric, objetivo_bbva boolean, sin_parametros boolean, hay_transacciones boolean, periodo text, meta_visitas integer, meta_reactivados integer, meta_conversion numeric, peso_reactivados numeric, peso_visitas numeric, peso_conversion numeric, puntos_min numeric, puntos_tope numeric, bono_min numeric, bono_tope numeric, bono_max numeric, bbva_meta_reactivados integer, pago_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (
    select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id
  ),
  pa as (select p.* from v2_parametros p, per where p.periodo = per.id),
  tx as (select exists (select 1 from v2_transacciones) hay),
  mb as (
    select m.correo, m.visitas_validas, m.estado
    from per, public.v2_mi_base(per.id) m
    where m.correo is not null
  ),
  b as (
    select correo,
           count(*)::int                                   n_base,
           count(*) filter (where visitas_validas > 0)::int n_vis,
           count(*) filter (where estado = 'rea')::int      n_rea
    from mb group by correo
  ),
  u as (
    select b.correo,
           coalesce(us.nombre_corto, us.nombre, b.correo) nombre,
           us.rol, b.n_base, b.n_vis, b.n_rea,
           case when b.n_vis > 0 then round(b.n_rea::numeric / b.n_vis * 100, 1) else 0 end conv
    from b left join usuarios us on us.correo = b.correo
  ),
  c as (
    select u.*, pa.*,
           round(least(u.n_vis::numeric / nullif(pa.meta_visitas, 0),     1) * 100, 1) cv,
           round(least(u.n_rea::numeric / nullif(pa.meta_reactivados, 0), 1) * 100, 1) cr,
           round(least(u.conv          / nullif(pa.meta_conversion, 0),   1) * 100, 1) cc
    from u left join pa on true
  ),
  d as (
    select c.*,
           round((c.cr * c.peso_reactivados + c.cv * c.peso_visitas + c.cc * c.peso_conversion) / 100, 1) pts,
           (c.bbva_meta_reactivados is not null and c.n_rea >= c.bbva_meta_reactivados) obj
    from c
  ),
  e as (
    select d.*,
           case when d.pts is null then null
                when d.pts >= d.puntos_tope and d.obj then d.bono_max
                when d.pts >= d.puntos_tope           then d.bono_tope
                when d.pts >= d.puntos_min            then round(d.bono_min
                       + (d.bono_tope - d.bono_min) * (d.pts - d.puntos_min)
                         / nullif(d.puntos_tope - d.puntos_min, 0), 1)
                else 0 end bono
    from d
  )
  select e.correo, e.nombre, e.rol,
         e.n_base, e.n_vis, e.n_rea, e.conv,
         e.cv, e.cr, e.cc, e.pts,
         e.bono,
         round(e.bono * e.pago_pct / 100, 2),
         round(e.bono * (100 - e.pago_pct) / 100, 2),
         e.obj,
         e.periodo is null,
         (select hay from tx),
         (select id from per),
         e.meta_visitas, e.meta_reactivados, e.meta_conversion,
         e.peso_reactivados, e.peso_visitas, e.peso_conversion,
         e.puntos_min, e.puntos_tope, e.bono_min, e.bono_tope, e.bono_max,
         e.bbva_meta_reactivados, e.pago_pct
  from e
  order by e.pts desc nulls last, e.nombre
$function$
;

CREATE OR REPLACE FUNCTION public.v2_cargar_geo_distritos(p_features jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f jsonb; n int := 0; v_nom text; v_clave text;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista carga los límites de distritos.'; end if;
  for f in select * from jsonb_array_elements(p_features) loop
    v_nom := f->'properties'->>'nombre';
    v_clave := upper(translate(v_nom, 'áéíóúÁÉÍÓÚüÜ', 'aeiouAEIOUuU'));
    v_clave := replace(v_clave, 'CARMEN DE LA LEGUA-REYNOSO', 'CARMEN DE LA LEGUA REYNOSO');
    insert into v2_geo_distritos(clave, nombre, provincia, osm_id, geometria)
    values (v_clave, v_nom, coalesce(f->'properties'->>'provincia', 'LIMA'), (f->'properties'->>'osm')::bigint, f->'geometry')
    on conflict (clave) do update set nombre = excluded.nombre, provincia = excluded.provincia, osm_id = excluded.osm_id,
      geometria = excluded.geometria, cargado_en = now();
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_cargar_transacciones(p_archivo text, p_formato text, p_filas jsonb, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_carga bigint; r jsonb; i int := 0; v_ins int := 0; v_upd int := 0;
  v_rech jsonb := '[]'::jsonb; v_cid text; v_fecha date; v_trx int; v_vol numeric; v_existe boolean; v_max date; v_msg text;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista carga transacciones.'; end if;
  if p_formato not in ('diario','acumulado_mes') then raise exception 'Formato no válido: diario o acumulado_mes.'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'No hay filas que cargar.'; end if;

  insert into v2_cargas(tipo, archivo, formato, filas, notas, por, en)
  values ('transacciones', p_archivo, p_formato, 0, p_notas, v_correo, now()) returning id into v_carga;

  for r in select * from jsonb_array_elements(p_filas) loop
    i := i + 1;
    begin
      v_cid := btrim(r->>'customer_id');
      if v_cid !~ '^[0-9]{8}$' then raise exception 'customer_id no tiene 8 dígitos'; end if;
      if not exists (select 1 from v2_comercios where customer_id = v_cid) then raise exception 'customer_id no está en la base'; end if;
      if (r->>'fecha_corte') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'fecha_corte no es AAAA-MM-DD'; end if;
      v_fecha := (r->>'fecha_corte')::date;
      if (r->>'trx') !~ '^\d+$' then raise exception 'trx no es un entero'; end if;
      v_trx := (r->>'trx')::int;
      if (r->>'vol') is not null and (r->>'vol') !~ '^-?\d+(\.\d+)?$' then raise exception 'vol no es numérico'; end if;
      v_vol := coalesce((r->>'vol')::numeric, 0); if v_vol < 0 then raise exception 'vol negativo'; end if;
      select true into v_existe from v2_transacciones where customer_id = v_cid and mes = to_char(v_fecha,'YYYY-MM') and fecha_corte = v_fecha;
      insert into v2_transacciones(fecha_corte, customer_id, mes, formato, vol, trx, carga_id)
      values (v_fecha, v_cid, to_char(v_fecha,'YYYY-MM'), p_formato, v_vol, v_trx, v_carga)
      on conflict (customer_id, mes, fecha_corte) do update
        set vol = excluded.vol, trx = excluded.trx, formato = excluded.formato, carga_id = excluded.carga_id;
      if v_existe then v_upd := v_upd + 1; else v_ins := v_ins + 1; end if;
      v_existe := null;
      v_max := greatest(coalesce(v_max, v_fecha), v_fecha);
    exception when others then
      v_msg := case when sqlstate = '22008' or sqlstate = '22007' then 'fecha_corte no es una fecha válida' else sqlerrm end;
      if jsonb_array_length(v_rech) < 300 then
        v_rech := v_rech || jsonb_build_object('fila', i, 'motivo', v_msg);
      end if;
    end;
  end loop;

  update v2_cargas set filas = v_ins + v_upd, fecha_corte = v_max,
         notas = concat_ws(' · ', p_notas, format('%s filas: %s nuevas, %s actualizadas, %s rechazadas', i, v_ins, v_upd, i - v_ins - v_upd))
   where id = v_carga;
  return jsonb_build_object('carga_id', v_carga, 'leidas', i, 'insertadas', v_ins, 'actualizadas', v_upd,
                            'rechazadas', i - v_ins - v_upd, 'detalle', v_rech, 'fecha_corte', v_max);
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_corregir_comercio(p_customer_id text, p_nombre text, p_direccion text, p_referencia text, p_contacto text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_correo text := public.correo_actual(); v_antes jsonb;
begin
  if not (public.es_admin() or exists (select 1 from v2_asignaciones where customer_id = p_customer_id and (correo = v_correo or correo is null))) then
    raise exception 'Este comercio no está en tu base.';
  end if;
  select jsonb_build_object('nombre',nombre_comercial,'direccion',direccion_corregida,'referencia',referencia,'contacto',contacto)
    into v_antes from v2_comercios where customer_id = p_customer_id;
  update v2_comercios set nombre_comercial = nullif(btrim(p_nombre),''), direccion_corregida = nullif(btrim(p_direccion),''),
    referencia = nullif(btrim(p_referencia),''), contacto = nullif(btrim(p_contacto),''), corregido_por = v_correo, corregido_en = now()
  where customer_id = p_customer_id;
  insert into v2_correcciones(customer_id, por, antes, despues) values (p_customer_id, v_correo, v_antes,
    jsonb_build_object('nombre',p_nombre,'direccion',p_direccion,'referencia',p_referencia,'contacto',p_contacto));
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_dias_trx(p_cid text, p_periodo text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with p as (select ini, fin from v2_periodos where id = p_periodo),
  v as (select min((visitado_en at time zone 'America/Lima')::date) d from v2_visitas
        where customer_id = p_cid and periodo = p_periodo and anulada_en is null and lat is not null and not fuera_plazo),
  t as (select fecha_corte, formato, trx,
          coalesce(lag(fecha_corte) over w, (to_date(mes,'YYYY-MM') - 1)) prev_corte,
          trx - coalesce(lag(trx) over w, 0) delta
        from v2_transacciones where customer_id = p_cid window w as (partition by mes, formato order by fecha_corte))
  select count(distinct t.fecha_corte)::int from t, v, p
  where v.d is not null and t.fecha_corte <= p.fin and (
    (t.formato = 'diario' and t.trx > 0 and t.fecha_corte > v.d) or
    (t.formato = 'acumulado_mes' and t.delta > 0 and t.prev_corte >= v.d))
$function$
;

CREATE OR REPLACE FUNCTION public.v2_editar_comentario(p_visita_id uuid, p_comentario text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_admin  boolean := public.es_admin();
  v_dueno  text; v_dia date; v_antes text; v_limite date;
  v_nuevo  text := btrim(coalesce(p_comentario, ''));
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  if length(v_nuevo) < 5 then raise exception 'El comentario tiene que decir algo: escribe al menos 5 caracteres.'; end if;

  select correo, (visitado_en at time zone 'America/Lima')::date, comentario
    into v_dueno, v_dia, v_antes
  from v2_visitas where id = p_visita_id and anulada_en is null;

  if v_dueno is null then raise exception 'Esa visita no existe o está anulada.'; end if;
  if not v_admin and v_dueno <> v_correo then raise exception 'Solo puedes corregir tus propias visitas.'; end if;

  if not v_admin then
    v_limite := public.v2_limite_habil(v_dia, 2);
    if (now() at time zone 'America/Lima')::date > v_limite then
      raise exception 'El plazo para corregir este comentario venció el %.', to_char(v_limite, 'DD/MM');
    end if;
  end if;

  if v_antes = v_nuevo then return; end if;

  update v2_visitas set comentario = v_nuevo, comentario_editado_en = now() where id = p_visita_id;
  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (p_visita_id, 'comentario', v_correo, v_antes, v_nuevo);
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_editar_resultado(p_visita_id uuid, p_con text, p_motivo text, p_que text, p_decision text, p_equipo text, p_fecha_reagenda date, p_comentario text, p_feedback text[] DEFAULT NULL::text[], p_feedback_nota text DEFAULT NULL::text, p_motivos_si text[] DEFAULT NULL::text[], p_fb_acciones text[] DEFAULT NULL::text[], p_fb_extra jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_admin  boolean := public.es_admin();
  v_dueno text; v_dia date; v_limite date; v_antes text; v_despues text;
  v_con text := btrim(coalesce(p_con,''));
  v_que text; v_motivo text; v_decision text; v_equipo text; v_fecha date;
  v_com text := btrim(coalesce(p_comentario,''));
  v_fb0 text[]; v_fbn0 text; v_fb text[]; v_fbn text; v_msi0 text[]; v_msi text[];
  v_acc0 text[]; v_ext0 jsonb; v_acc text[]; v_ext jsonb;
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;

  select correo, (visitado_en at time zone 'America/Lima')::date,
         public.v2_resumen_visita(con, motivo, que, decision, equipo, fecha_reagenda, comentario),
         feedback, feedback_nota, motivos_si, fb_acciones, fb_extra
    into v_dueno, v_dia, v_antes, v_fb0, v_fbn0, v_msi0, v_acc0, v_ext0
  from v2_visitas where id = p_visita_id and anulada_en is null;

  if v_dueno is null then raise exception 'Esa visita no existe o está anulada.'; end if;
  if not v_admin and v_dueno <> v_correo then raise exception 'Solo puedes corregir tus propias visitas.'; end if;

  if not v_admin then
    v_limite := public.v2_limite_habil(v_dia, 2);
    if (now() at time zone 'America/Lima')::date > v_limite then
      raise exception 'El plazo para corregir esta visita venció el %.', to_char(v_limite, 'DD/MM');
    end if;
  end if;

  if v_con not in ('Dueño','Tercero','Nadie') then raise exception 'Con quién hablaste no es válido.'; end if;
  if v_com = '' or length(v_com) < 5 then raise exception 'El comentario tiene que decir algo: escribe al menos 5 caracteres.'; end if;

  if v_con = 'Nadie' then
    v_motivo := nullif(btrim(coalesce(p_motivo,'')),'');
    if v_motivo not in ('Cerrado','No estaba','No atendió','Dirección errada') then raise exception 'Elige por qué no hubo contacto.'; end if;
    v_que := 'Sin éxito'; v_decision := null; v_equipo := null; v_fecha := null;
  else
    v_motivo := null;
    v_que := nullif(btrim(coalesce(p_que,'')),'');
    if v_que not in ('Reunión concretada','Reagendada','Sin éxito') then raise exception 'Elige qué pasó en la visita.'; end if;

    if v_que = 'Reunión concretada' then
      v_decision := nullif(btrim(coalesce(p_decision,'')),'');
      if v_decision not in ('Realizará consumos','Aún no decide','Desiste del producto') then raise exception 'Elige qué decidió el comercio.'; end if;
      if v_decision = 'Desiste del producto' then
        v_equipo := nullif(btrim(coalesce(p_equipo,'')),'');
        if v_equipo not in ('Sí','No','Pendiente') then raise exception 'Indica si se recuperó el equipo.'; end if;
      else v_equipo := null; end if;
    else v_decision := null; v_equipo := null; end if;

    if v_que = 'Reagendada' then
      v_fecha := p_fecha_reagenda;
      if v_fecha is null then raise exception 'Indica la fecha en que vuelves.'; end if;
    else v_fecha := null; end if;
  end if;

  if v_con = 'Nadie' then v_fb := null; v_fbn := null; v_acc := null; v_ext := null;
  elsif p_feedback is null then v_fb := v_fb0; v_fbn := v_fbn0; v_acc := v_acc0; v_ext := v_ext0;
  else
    v_fb := public.v2_feedback_limpio(p_feedback, v_con);
    v_fbn := nullif(btrim(coalesce(p_feedback_nota, '')), '');
    if char_length(v_fbn) > 300 then raise exception 'El feedback adicional admite hasta 300 caracteres.'; end if;
    v_acc := public.v2_fb_acciones_limpio(p_fb_acciones, v_fb);
    v_ext := public.v2_fb_extra_limpio(p_fb_extra, v_fb);
  end if;

  if v_con <> 'Nadie' then
    if v_que = 'Reagendada' then
      v_fb := public.v2_feedback_limpio(array_remove(coalesce(v_fb, '{}'::text[]), 'Sin observaciones del comercio') || array['No se encontraba la persona que tomaba decisiones'], v_con);
      v_acc := public.v2_fb_acciones_limpio(coalesce(v_acc, '{}'::text[]) || array['Reagendé con quien decide'], v_fb);
    else
      v_acc := public.v2_fb_acciones_limpio(array_remove(v_acc, 'Reagendé con quien decide'), v_fb);
    end if;
    if cardinality(v_acc) = 0 then v_acc := null; end if;
    v_ext := public.v2_fb_extra_limpio(v_ext, v_fb);
  end if;

  if v_decision is distinct from 'Realizará consumos' then v_msi := null;
  elsif p_motivos_si is null then v_msi := v_msi0;
  else v_msi := public.v2_motivos_si_limpio(p_motivos_si, v_decision); end if;

  v_antes := v_antes || coalesce(' · Feedback: ' || array_to_string(v_fb0, ' | '), '') || coalesce(' · Nota: ' || v_fbn0, '')
             || coalesce(' · Qué ofreció: ' || array_to_string(v_acc0, ' | '), '') || coalesce(' · Detalle: ' || v_ext0::text, '')
             || coalesce(' · Por qué sí: ' || array_to_string(v_msi0, ' | '), '');
  v_despues := public.v2_resumen_visita(v_con, v_motivo, v_que, v_decision, v_equipo, v_fecha, v_com)
               || coalesce(' · Feedback: ' || array_to_string(v_fb, ' | '), '') || coalesce(' · Nota: ' || v_fbn, '')
               || coalesce(' · Qué ofreció: ' || array_to_string(v_acc, ' | '), '') || coalesce(' · Detalle: ' || v_ext::text, '')
               || coalesce(' · Por qué sí: ' || array_to_string(v_msi, ' | '), '');
  if v_antes is not distinct from v_despues then return; end if;

  update v2_visitas set con = v_con, motivo = v_motivo, que = v_que, decision = v_decision,
         equipo = v_equipo, fecha_reagenda = v_fecha, comentario = v_com,
         feedback = v_fb, feedback_nota = v_fbn, motivos_si = v_msi, fb_acciones = v_acc, fb_extra = v_ext,
         resultado_editado_en = now(), resultado_editado_por = v_correo
  where id = p_visita_id;

  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (p_visita_id, 'resultado', v_correo, v_antes, v_despues);
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_fb_acciones_limpio(p_acc text[], p_fb text[])
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text[]; v_malo text; v_ramas text[];
begin
  if p_acc is null or p_fb is null then return null; end if;
  select array_agg(distinct grupo) into v_ramas from v2_feedback_tipos where texto = any(p_fb) and grupo <> 'Sin observaciones';
  if v_ramas is null then return null; end if;
  select array_agg(distinct case when btrim(x) = 'Solicité cambio de equipo' then 'Solicité cambio de equipo (sin costo)' else btrim(x) end)
    into v from unnest(p_acc) x where nullif(btrim(x), '') is not null;
  if v is null then return null; end if;
  select x into v_malo from unnest(v) x where not exists (select 1 from v2_feedback_acciones a where a.texto = x) limit 1;
  if v_malo is not null then raise exception 'La acción «%» no está en la lista.', v_malo; end if;
  select x into v_malo from unnest(v) x where not exists (select 1 from v2_feedback_acciones a where a.texto = x and a.ramas && v_ramas) limit 1;
  if v_malo is not null then raise exception 'La acción «%» no corresponde al feedback marcado.', v_malo; end if;
  select array_agg(a.texto order by a.orden, a.texto desc) into v from v2_feedback_acciones a where a.texto = any(v);
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_fb_extra_limpio(p jsonb, p_fb text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb := '{}'::jsonb; v text[]; t numeric; o text; d numeric;
begin
  if p is null or p_fb is null or jsonb_typeof(p) <> 'object' then return null; end if;
  if 'Usa POS de otra marca' = any(p_fb) then
    select array_agg(x order by array_position(array['Niubiz','Izipay','Culqi','Mercado Pago','Otro'], x)) into v
      from (select distinct x from jsonb_array_elements_text(coalesce(p->'competidores', '[]')) x
             where x = any(array['Niubiz','Izipay','Culqi','Mercado Pago','Otro'])) s;
    if v is not null then r := r || jsonb_build_object('competidores', to_jsonb(v)); end if;
    o := nullif(btrim(coalesce(p->>'competidor_otro', '')), '');
    if o is not null and 'Otro' = any(coalesce(v, '{}')) then
      if char_length(o) > 60 then raise exception 'El nombre del otro competidor admite hasta 60 caracteres.'; end if;
      r := r || jsonb_build_object('competidor_otro', o);
    end if;
    if nullif(btrim(coalesce(p->>'tasa_competidor', '')), '') is not null then
      begin t := replace(p->>'tasa_competidor', ',', '.')::numeric;
      exception when others then raise exception 'La tasa del competidor debe ser un número (ej.: 2,5).'; end;
      if t <= 0 or t > 15 then raise exception 'La tasa del competidor debe estar entre 0 y 15 %%.'; end if;
      r := r || jsonb_build_object('tasa_competidor', round(t, 2));
    end if;
    select array_agg(x order by array_position(array['Tasa','Abono más rápido','Equipo o señal','Costumbre o atención'], x)) into v
      from (select distinct x from jsonb_array_elements_text(coalesce(p->'prefiere_por', '[]')) x
             where x = any(array['Tasa','Abono más rápido','Equipo o señal','Costumbre o atención'])) s;
    if v is not null then r := r || jsonb_build_object('prefiere_por', to_jsonb(v)); end if;
  end if;
  if 'No necesitaba los POS' = any(p_fb) then
    o := p->>'no_necesita_por';
    if o = any(array['Pocas ventas con tarjeta','Negocio cerrado o por cerrar','Otro motivo']) then
      r := r || jsonb_build_object('no_necesita_por', o);
    end if;
  end if;
  if 'Los abonos le llegan con demora' = any(p_fb) then
    if nullif(btrim(coalesce(p->>'dias_demora_abono', '')), '') is not null then
      begin d := replace(p->>'dias_demora_abono', ',', '.')::numeric;
      exception when others then raise exception 'Los días de demora deben ser un número (ej.: 3).'; end;
      if d < 1 or d > 60 or d <> trunc(d) then raise exception 'Los días de demora deben ser un número entero entre 1 y 60.'; end if;
      r := r || jsonb_build_object('dias_demora_abono', d::int);
    end if;
    o := p->>'banco_abono';
    if o = any(array['BBVA','Otro banco']) then r := r || jsonb_build_object('banco_abono', o); end if;
  end if;
  return nullif(r, '{}'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_feedback_inferido_valida()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare m text;
begin
  select x into m from unnest(new.tipos) x where not exists (select 1 from v2_feedback_tipos t where t.texto = x) limit 1;
  if m is not null then raise exception 'Tipo de feedback fuera de la lista: %', m; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_feedback_limpio(p_feedback text[], p_con text)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text[]; v_malo text;
begin
  if p_con = 'Nadie' or p_feedback is null then return null; end if;
  select array_agg(distinct case when btrim(x) = 'Usa POS o pasarela de la competencia' then 'Usa POS de otra marca' else btrim(x) end)
    into v from unnest(p_feedback) x where nullif(btrim(x), '') is not null;
  if v is null then return null; end if;
  select x into v_malo from unnest(v) x where not exists (select 1 from v2_feedback_tipos t where t.texto = x) limit 1;
  if v_malo is not null then raise exception 'El feedback «%» no está en la lista.', v_malo; end if;
  if 'Sin observaciones del comercio' = any(v) and cardinality(v) > 1 then
    raise exception '«Sin observaciones del comercio» no se combina con otro feedback.';
  end if;
  select array_agg(t.texto order by t.orden) into v from v2_feedback_tipos t where t.texto = any(v);
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_fijar_geo_por_visita()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_con_previo text;
begin
  if new.lat is null or coalesce(new.precision_m, 999) > 60 then return new; end if;
  if new.comercio_ubicado = false then return new; end if;
  if new.comercio_ubicado is distinct from true then
    if new.motivo = 'Dirección errada' then return new; end if;
    if new.direccion_ok = false and new.con = 'Nadie' then return new; end if;
  end if;

  select v.con into v_con_previo
    from v2_comercios c left join v2_visitas v on v.id = c.geo_visita_id
   where c.customer_id = new.customer_id and c.geo_calidad = 'visita';

  update v2_comercios
     set geo_lat = new.lat, geo_lng = new.lng, geo_calidad = 'visita', geo_visita_id = new.id,
         geo_detalle = 'GPS de la visita del ' || to_char(new.visitado_en at time zone 'America/Lima', 'DD/MM HH24:MI')
                       || case when new.comercio_ubicado then ' · el ejecutivo ubicó el comercio en otra dirección'
                               when new.direccion_ok = false then ' · el ejecutivo indicó que la dirección de la base no es correcta'
                               else '' end,
         geo_en = now()
   where customer_id = new.customer_id
     and (
       coalesce(geo_calidad, 'sin_ubicar') in ('calle','lugar','distrito','sin_ubicar')
       or (new.con <> 'Nadie' and coalesce(v_con_previo, 'Nadie') = 'Nadie')
       or (new.con <> 'Nadie' and new.direccion_ok = false)
       or (new.comercio_ubicado and coalesce(v_con_previo, 'Nadie') = 'Nadie')
     );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_fijar_plazo_visita()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_dia date := (new.visitado_en at time zone 'America/Lima')::date; v_fin date;
begin
  select fin into v_fin from v2_periodos where id = new.periodo;
  new.plazo_hasta := least(public.v2_limite_habil(v_dia, 1), coalesce(v_fin, 'infinity'::date));
  new.fuera_plazo := (coalesce(new.recibido_en, now()) at time zone 'America/Lima')::date > new.plazo_hasta;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_fijar_ref_visita()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.ref_lat is null then
    select geo_lat, geo_lng, geo_calidad, geo_detalle into new.ref_lat, new.ref_lng, new.ref_calidad, new.ref_nota
    from v2_comercios where customer_id = new.customer_id;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_limite_habil(p_desde date, p_dias integer DEFAULT 2)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d date := p_desde; n integer := 0;
begin
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists (select 1 from v2_feriados f where f.fecha = d) then
      n := n + 1;
    end if;
  end loop;
  return d;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_metros(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select case when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else round(sqrt(
      power((p_lat1 - p_lat2) * 111320.0, 2) +
      power((p_lng1 - p_lng2) * 111320.0 * cos(radians((p_lat1 + p_lat2) / 2)), 2)))::int end
$function$
;

CREATE OR REPLACE FUNCTION public.v2_mi_base(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, razon_social text, rubro text, departamento text, provincia text, distrito text, direccion text, zona text, tasa_debito numeric, tasa_credito numeric, tasa_foranea numeric, nombre_comercial text, direccion_corregida text, referencia text, contacto text, correo text, ruta text, orden integer, estado_comercio text, visitas integer, visitas_validas integer, ultima_visita timestamp with time zone, ultima_que text, ultima_decision text, dias_trx integer, estado text, referencia_base text, direccion_original text, geo_lat double precision, geo_lng double precision, geo_calidad text, ruc text, terminales integer, tasas_aprox boolean, sunat_direccion text, sunat_lat double precision, sunat_lng double precision, sunat_metros integer, sunat_estado text, dir_extra jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id),
  a as (select a.* from v2_asignaciones a, per where a.periodo = per.id
        and (public.es_admin() or a.correo = public.correo_actual() or a.correo is null)),
  vs as (select v.customer_id, count(*)::int n, count(*) filter (where v.lat is not null and not v.fuera_plazo)::int nv, max(v.visitado_en) ult
         from v2_visitas v, per where v.periodo = per.id and v.anulada_en is null group by v.customer_id),
  lv as (select distinct on (v.customer_id) v.customer_id, v.que, v.decision from v2_visitas v, per
         where v.periodo = per.id and v.anulada_en is null order by v.customer_id, v.visitado_en desc),
  dx as (select e.customer_id, jsonb_agg(jsonb_build_object('direccion', e.direccion, 'distrito', e.distrito, 'en_zona', e.en_zona, 'verificacion', e.verificacion, 'lat', e.geo_lat, 'lng', e.geo_lng) order by e.orden) l
         from v2_direcciones_extra e where e.activa group by e.customer_id)
  select c.customer_id, c.razon_social, c.rubro, c.departamento, c.provincia, c.distrito, c.direccion, c.zona,
    c.tasa_debito, c.tasa_credito, c.tasa_foranea, c.nombre_comercial, c.direccion_corregida, c.referencia, c.contacto,
    a.correo, a.ruta, a.orden, c.estado, coalesce(vs.n,0), coalesce(vs.nv,0), vs.ult, lv.que, lv.decision, d.dias,
    case when c.estado = 'Cancelado' then 'can'
         when d.dias >= 2 then 'rea'
         when d.dias = 1 then 'uno'
         when lv.decision = 'Realizará consumos' then 'esp'
         when lv.decision = 'Aún no decide' then 'seg'
         when lv.decision = 'Desiste del producto' then 'des'
         when lv.que = 'Reagendada' then 'rag'
         when lv.que = 'Sin éxito' then 'sin'
         when lv.que is not null then 'vis'
         else 'por' end,
    c.referencia_base, c.direccion_original, c.geo_lat, c.geo_lng, c.geo_calidad,
    c.ruc, c.terminales, c.tasas_aprox,
    case when s.difiere then nullif(btrim(coalesce(s.direccion,'')), '') end,
    case when s.difiere then sg.lat end,
    case when s.difiere then sg.lng end,
    case when s.difiere then public.v2_metros(c.geo_lat, c.geo_lng, sg.lat, sg.lng) end,
    nullif(s.estado, 'ACTIVO'),
    dx.l
  from a join v2_comercios c on c.customer_id = a.customer_id
  cross join per
  left join vs on vs.customer_id = a.customer_id
  left join lv on lv.customer_id = a.customer_id
  left join v2_sunat s on s.ruc = c.ruc
  left join dx on dx.customer_id = a.customer_id
  cross join lateral (
    select case when s.geo_lat between -12.6 and -11.3 and s.geo_lng between -77.35 and -76.5 then s.geo_lat end lat,
           case when s.geo_lat between -12.6 and -11.3 and s.geo_lng between -77.35 and -76.5 then s.geo_lng end lng
  ) sg
  cross join lateral (select case when vs.n is null then 0 else public.v2_dias_trx(a.customer_id, per.id) end dias) d
$function$
;

CREATE OR REPLACE FUNCTION public.v2_mis_revisiones(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(en_revision integer, validadas integer, ultima_observacion timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id)
  select count(*) filter (where v.validacion = 'observada')::int,
         count(*) filter (where v.validacion = 'validada')::int,
         max(v.validacion_en) filter (where v.validacion = 'observada')
  from v2_visitas v, per
  where v.periodo = per.id and v.anulada_en is null and v.correo = public.correo_actual()
$function$
;

CREATE OR REPLACE FUNCTION public.v2_motivos_si_limpio(p text[], p_decision text)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text[]; m text;
begin
  if p_decision is distinct from 'Realizará consumos' or p is null then return null; end if;
  select array_agg(distinct btrim(x)) into v from unnest(p) x where nullif(btrim(x),'') is not null;
  if v is null then return null; end if;
  select x into m from unnest(v) x where not exists (select 1 from v2_motivo_si_tipos t where t.texto = x) limit 1;
  if m is not null then raise exception 'El motivo «%» no está en la lista.', m; end if;
  select array_agg(t.texto order by t.orden) into v from v2_motivo_si_tipos t where t.texto = any(v);
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_pedir_anulacion(p_visita_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_dueno text; v_anulada timestamptz; v_pedida timestamptz; v_resuelta timestamptz;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  if length(v_motivo) < 10 then raise exception 'Cuéntanos por qué hay que anularla: escribe al menos 10 caracteres.'; end if;

  select correo, anulada_en, anul_pedida_en, anul_resuelta_en
    into v_dueno, v_anulada, v_pedida, v_resuelta
  from v2_visitas where id = p_visita_id;

  if v_dueno is null then raise exception 'Esa visita no existe.'; end if;
  if not public.es_admin() and v_dueno <> v_correo then raise exception 'Solo puedes pedir la anulación de tus propias visitas.'; end if;
  if v_anulada is not null then raise exception 'Esa visita ya está anulada.'; end if;
  if v_pedida is not null and v_resuelta is null then raise exception 'Ya hay un pedido pendiente para esa visita.'; end if;

  update v2_visitas
     set anul_pedida_en = now(), anul_pedida_por = v_correo, anul_pedida_motivo = v_motivo,
         anul_resuelta_en = null, anul_resuelta_por = null, anul_resuelta_nota = null
   where id = p_visita_id;

  insert into v2_bitacora_visita(visita_id, accion, por, despues)
  values (p_visita_id, 'pedido', v_correo, v_motivo);
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_periodo_de(p_fecha date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select id from public.v2_periodos where p_fecha between ini and fin
$function$
;

CREATE OR REPLACE FUNCTION public.v2_puede_escritorio()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.es_usuario_activo() and exists (
    select 1 from public.v2_acceso_escritorio where correo = public.correo_actual())
$function$
;

CREATE OR REPLACE FUNCTION public.v2_registrar_visita(p_customer_id text, p_visitado_en timestamp with time zone, p_lat double precision, p_lng double precision, p_precision numeric, p_con text, p_motivo text, p_que text, p_decision text, p_equipo text, p_fecha_reagenda date, p_comentario text, p_cliente_uid text, p_direccion_ok boolean DEFAULT NULL::boolean, p_feedback text[] DEFAULT NULL::text[], p_feedback_nota text DEFAULT NULL::text, p_motivos_si text[] DEFAULT NULL::text[], p_comercio_ubicado boolean DEFAULT NULL::boolean, p_direccion_nueva text DEFAULT NULL::text, p_fb_acciones text[] DEFAULT NULL::text[], p_fb_extra jsonb DEFAULT NULL::jsonb, p_comentario_voz text DEFAULT NULL::text, p_ia_propuesta jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_per text; v_id uuid; v_dueno text; v_existe boolean; v_fin date;
  v_clat double precision; v_clng double precision; v_dist integer;
  v_dia date := (p_visitado_en at time zone 'America/Lima')::date;
  v_fb text[]; v_fbn text; v_msi text[]; v_dok boolean; v_ubi boolean; v_dnu text; v_acc text[]; v_ext jsonb; v_voz text;
  v_hora_dup text;
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  if p_cliente_uid is not null then
    select id into v_id from v2_visitas where cliente_uid = p_cliente_uid;
    if v_id is not null then return v_id; end if;
  end if;

  v_fb := public.v2_feedback_limpio(
            case when p_con <> 'Nadie' and p_que = 'Reagendada'
                 then array_remove(coalesce(p_feedback, '{}'::text[]), 'Sin observaciones del comercio') || array['No se encontraba la persona que tomaba decisiones']
                 else p_feedback end, p_con);
  v_acc := public.v2_fb_acciones_limpio(
            case when p_con <> 'Nadie' and p_que = 'Reagendada' then coalesce(p_fb_acciones, '{}'::text[]) || array['Reagendé con quien decide']
                 else array_remove(p_fb_acciones, 'Reagendé con quien decide') end, v_fb);
  if cardinality(v_acc) = 0 then v_acc := null; end if;
  v_ext := public.v2_fb_extra_limpio(p_fb_extra, v_fb);
  v_fbn := case when p_con <> 'Nadie' then nullif(btrim(coalesce(p_feedback_nota, '')), '') end;
  v_msi := case when p_con <> 'Nadie' and p_que = 'Reunión concretada' then public.v2_motivos_si_limpio(p_motivos_si, p_decision) end;
  v_dok := case when p_con = 'Nadie' and p_motivo = 'Dirección errada' then false else p_direccion_ok end;
  v_ubi := case when v_dok = false then p_comercio_ubicado end;
  v_dnu := case when v_ubi then nullif(btrim(coalesce(p_direccion_nueva, '')), '') end;
  v_voz := nullif(btrim(coalesce(p_comentario_voz, '')), '');

  if p_visitado_en > now() + interval '10 minutes' then raise exception 'La hora de la visita no puede ser futura.'; end if;
  if char_length(v_fbn) > 300 then raise exception 'El feedback adicional admite hasta 300 caracteres.'; end if;
  if char_length(v_voz) > 4000 then raise exception 'El texto dictado admite hasta 4000 caracteres.'; end if;
  if char_length(v_dnu) > 200 then raise exception 'La dirección donde está el comercio admite hasta 200 caracteres.'; end if;

  if p_con <> 'Nadie' then
    if p_que = 'Reunión concretada' and p_decision is null then raise exception 'Elige qué decidió el comercio.'; end if;
    if p_decision = 'Desiste del producto' and p_equipo is null then raise exception 'Indica si se recuperó el equipo.'; end if;
    if p_que = 'Reagendada' and p_fecha_reagenda is null then raise exception 'Indica la fecha en que vuelves.'; end if;
    if p_que = 'Reagendada' and p_fecha_reagenda < v_dia then raise exception 'La fecha en que vuelves no puede ser anterior a la visita.'; end if;
  end if;

  v_per := public.v2_periodo_de(v_dia);
  if v_per is null then raise exception 'La fecha de la visita no cae en ningún periodo abierto.'; end if;
  select fin into v_fin from v2_periodos where id = v_per;
  if (now() at time zone 'America/Lima')::date > v_fin then
    raise exception 'El periodo cerró el %: ya no se reciben visitas de ese periodo.', to_char(v_fin, 'DD/MM');
  end if;
  select true, correo into v_existe, v_dueno from v2_asignaciones where periodo = v_per and customer_id = p_customer_id for update;
  if v_existe is null then raise exception 'Este comercio no está en la base del periodo.'; end if;
  if v_dueno is null then
    update v2_asignaciones set correo = v_correo, tomado_en = now() where periodo = v_per and customer_id = p_customer_id and correo is null;
  elsif v_dueno <> v_correo then
    raise exception 'Este comercio ya lo está trabajando otro ejecutivo.';
  end if;

  select to_char(visitado_en at time zone 'America/Lima', 'HH24:MI') into v_hora_dup
    from v2_visitas where customer_id = p_customer_id and anulada_en is null
     and (visitado_en at time zone 'America/Lima')::date = v_dia
   order by visitado_en limit 1;
  if v_hora_dup is not null then
    raise exception 'Este comercio ya tiene una visita el % a las %. Corrige esa visita en lugar de registrar otra.', to_char(v_dia, 'DD/MM'), v_hora_dup;
  end if;

  select geo_lat, geo_lng into v_clat, v_clng from v2_comercios where customer_id = p_customer_id;
  v_dist := public.v2_metros(p_lat, p_lng, v_clat, v_clng);

  insert into v2_visitas(periodo, customer_id, correo, visitado_en, lat, lng, precision_m, distancia_m,
                         con, motivo, que, decision, equipo, fecha_reagenda, comentario, cliente_uid, direccion_ok,
                         feedback, feedback_nota, motivos_si, comercio_ubicado, direccion_nueva,
                         fb_acciones, fb_extra, comentario_voz, ia_propuesta)
  values (v_per, p_customer_id, v_correo, p_visitado_en, p_lat, p_lng, p_precision, v_dist, p_con,
          case when p_con = 'Nadie' then p_motivo end,
          case when p_con = 'Nadie' then 'Sin éxito' else p_que end,
          case when p_que = 'Reunión concretada' then p_decision end,
          case when p_decision = 'Desiste del producto' then p_equipo end,
          case when p_que = 'Reagendada' then p_fecha_reagenda end,
          btrim(p_comentario), p_cliente_uid, v_dok,
          v_fb, v_fbn, v_msi, v_ubi, v_dnu, v_acc, v_ext, v_voz, p_ia_propuesta)
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_resolver_anulacion(p_visita_id uuid, p_aprobar boolean, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_pedida timestamptz; v_anulada timestamptz; v_motivo text;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not public.es_admin() then raise exception 'Solo el analista resuelve las anulaciones.'; end if;

  select anul_pedida_en, anulada_en, anul_pedida_motivo
    into v_pedida, v_anulada, v_motivo
  from v2_visitas where id = p_visita_id;

  if v_pedida is null and v_anulada is null and not p_aprobar then
    raise exception 'No hay ningún pedido que rechazar en esa visita.';
  end if;
  if v_anulada is not null then raise exception 'Esa visita ya está anulada.'; end if;

  if p_aprobar then
    update v2_visitas
       set anulada_en = now(), anulada_por = v_correo,
           anulada_motivo = coalesce(v_nota, v_motivo, 'Anulada por el analista'),
           anul_resuelta_en = now(), anul_resuelta_por = v_correo, anul_resuelta_nota = v_nota
     where id = p_visita_id;
    insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
    values (p_visita_id, 'aprobado', v_correo, v_motivo, v_nota);
  else
    update v2_visitas
       set anul_resuelta_en = now(), anul_resuelta_por = v_correo, anul_resuelta_nota = v_nota
     where id = p_visita_id;
    insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
    values (p_visita_id, 'rechazado', v_correo, v_motivo, v_nota);
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_restituir_visita(p_visita_id uuid, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual(); v_nota text := nullif(btrim(coalesce(p_nota,'')),'');
  v_anulada timestamptz; v_motivo text; v_existe boolean;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista restituye visitas.'; end if;
  select true, anulada_en, anulada_motivo into v_existe, v_anulada, v_motivo from v2_visitas where id = p_visita_id for update;
  if v_existe is null then raise exception 'Esa visita no existe.'; end if;
  if v_anulada is null then raise exception 'Esa visita no está anulada.'; end if;
  update v2_visitas
     set anulada_en = null, anulada_por = null, anulada_motivo = null,
         validacion = 'validada', validacion_en = now(), validacion_por = v_correo, validacion_motivo = null, validacion_nota = v_nota
   where id = p_visita_id;
  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (p_visita_id, 'restituida', v_correo, v_motivo, coalesce(v_nota, 'Vuelve a contar'));
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_resumen_visita(p_con text, p_motivo text, p_que text, p_decision text, p_equipo text, p_fecha date, p_comentario text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select concat_ws(' · ',
    nullif(p_con,''), nullif(p_motivo,''), nullif(p_que,''), nullif(p_decision,''),
    case when p_equipo is not null then 'equipo: ' || p_equipo end,
    case when p_fecha is not null then 'vuelve ' || to_char(p_fecha,'DD/MM') end,
    nullif(btrim(coalesce(p_comentario,'')),''))
$function$
;

CREATE OR REPLACE FUNCTION public.v2_revision_tras_correccion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.validacion = 'observada' and new.validacion = 'observada'
     and (new.resultado_editado_en is distinct from old.resultado_editado_en
          or new.comentario_editado_en is distinct from old.comentario_editado_en
          or new.ubicacion_editada_en is distinct from old.ubicacion_editada_en) then
    new.validacion := 'validada';
    new.validacion_en := now();
    new.validacion_por := 'automática';
    new.validacion_nota := 'Corregida por el ejecutivo tras la observación: ' || coalesce(old.validacion_motivo, '');
    insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
    values (new.id, 'revision', public.correo_actual(), 'observada · ' || coalesce(old.validacion_motivo,''), 'validada · corregida por el ejecutivo');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_validacion_automatica()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.validacion is null or new.validacion = 'pendiente' then
    new.validacion := 'validada'; new.validacion_en := now(); new.validacion_por := 'automática';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_validar_visita(p_visita_id uuid, p_estado text, p_motivo text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_antes text; v_motivo text := nullif(btrim(coalesce(p_motivo,'')),''); v_nota text := nullif(btrim(coalesce(p_nota,'')),'');
  v_anulada timestamptz; v_est text;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista valida las visitas.'; end if;
  if p_estado not in ('validada','observada','pendiente') then raise exception 'Estado de validación no válido.'; end if;
  if p_estado = 'observada' and v_motivo is null then raise exception 'Indica el motivo de la observación.'; end if;

  select validacion, validacion_motivo, anulada_en into v_est, v_antes, v_anulada
  from v2_visitas where id = p_visita_id for update;
  if v_est is null then raise exception 'Esa visita no existe.'; end if;
  if v_anulada is not null then raise exception 'Esa visita está anulada. Restitúyela primero.'; end if;
  if v_est = p_estado and v_est <> 'observada' then return; end if;

  update v2_visitas
     set validacion = p_estado, validacion_en = now(), validacion_por = v_correo,
         validacion_motivo = case when p_estado = 'observada' then v_motivo else null end,
         validacion_nota = v_nota
   where id = p_visita_id;

  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (p_visita_id, case p_estado when 'validada' then 'validada' when 'observada' then 'observada' else 'revision' end,
          v_correo, v_est || coalesce(' · ' || v_antes, ''),
          p_estado || coalesce(' · ' || v_motivo, '') || coalesce(' · ' || v_nota, ''));
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_visitas_de(p_customer_id text, p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, periodo text, visitado_en timestamp with time zone, recibido_en timestamp with time zone, correo text, ejecutivo text, con text, motivo text, que text, decision text, equipo text, fecha_reagenda date, comentario text, comentario_editado_en timestamp with time zone, editado_en timestamp with time zone, lat double precision, lng double precision, precision_m numeric, distancia_m integer, estado_anul text, anul_motivo text, anul_nota text, anul_por text, puede_editar boolean, limite_edicion date, es_mia boolean, validacion text, validacion_en timestamp with time zone, validacion_motivo text, validacion_nota text, direccion_ok boolean, plazo_hasta date, fuera_plazo boolean, ubicacion_editada_en timestamp with time zone, feedback text[], feedback_nota text, motivos_si text[], comercio_ubicado boolean, direccion_nueva text, fb_acciones text[], fb_extra jsonb, comentario_voz text, ia_propuesta jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id),
  yo as (select public.correo_actual() c, public.es_admin() adm, (now() at time zone 'America/Lima')::date hoy)
  select v.id, v.periodo, v.visitado_en, v.recibido_en,
         v.correo, coalesce(u.nombre_corto, u.nombre, v.correo),
         v.con, v.motivo, v.que, v.decision, v.equipo,
         v.fecha_reagenda, v.comentario, v.comentario_editado_en,
         greatest(v.comentario_editado_en, v.resultado_editado_en),
         v.lat, v.lng, v.precision_m, v.distancia_m,
         case when v.anulada_en is not null then 'anulada'
              when v.anul_pedida_en is not null and v.anul_resuelta_en is null then 'pendiente'
              when v.anul_resuelta_en is not null then 'rechazada'
              else 'activa' end,
         coalesce(v.anulada_motivo, v.anul_pedida_motivo), v.anul_resuelta_nota,
         coalesce(v.anulada_por, v.anul_resuelta_por),
         v.anulada_en is null and (yo.adm or (v.correo = yo.c and yo.hoy <= lim.d)),
         lim.d,
         v.correo = yo.c,
         v.validacion, v.validacion_en, v.validacion_motivo, v.validacion_nota, v.direccion_ok,
         v.plazo_hasta, v.fuera_plazo, v.ubicacion_editada_en, v.feedback, v.feedback_nota, v.motivos_si,
         v.comercio_ubicado, v.direccion_nueva, v.fb_acciones, v.fb_extra, v.comentario_voz, v.ia_propuesta
  from v2_visitas v
  left join usuarios u on u.correo = v.correo
  cross join per cross join yo
  cross join lateral (select public.v2_limite_habil((v.visitado_en at time zone 'America/Lima')::date, 2) d) lim
  where v.customer_id = p_customer_id
    and v.periodo = per.id
    and (yo.adm or v.correo = yo.c)
  order by v.visitado_en desc
$function$
;

-- ===================== VISTAS =====================
create or replace view public.v_base as
 SELECT c.customer_id,
    r.nombre AS rubro,
    COALESCE(c.rubro_otro, r.nombre) AS rubro_detalle,
    c.nombre_comercio,
    c.distrito,
    c.direccion,
    c.estado,
    c.asignado AS ejecutivo,
    c.asignado_correo,
    ( SELECT count(*) AS count
           FROM interacciones i
          WHERE i.customer_id = c.customer_id) AS intentos,
    ( SELECT count(*) AS count
           FROM interacciones i
          WHERE i.customer_id = c.customer_id AND i.resultado = 'efectivo'::text) AS efectivos,
    ( SELECT count(*) AS count
           FROM interacciones i
          WHERE i.customer_id = c.customer_id AND i.cumple_visita = 'SI'::text) AS visitas_validas,
    ( SELECT max(i.fecha_contacto) AS max
           FROM interacciones i
          WHERE i.customer_id = c.customer_id) AS ultimo_contacto,
    c.creado_en
   FROM clientes c
     JOIN rubros r ON r.codigo = c.rubro;

create or replace view public.v_efectividad as
 SELECT correo,
    COALESCE(nombre_corto, nombre) AS ejecutivo,
    ( SELECT count(*) AS count
           FROM clientes c
          WHERE c.asignado_correo = u.correo) AS clientes,
    ( SELECT count(*) AS count
           FROM interacciones i
          WHERE i.correo_stratis = u.correo) AS intentos,
    ( SELECT count(*) AS count
           FROM interacciones i
          WHERE i.correo_stratis = u.correo AND i.resultado = 'efectivo'::text) AS efectivos,
    ( SELECT count(*) AS count
           FROM interacciones i
          WHERE i.correo_stratis = u.correo AND i.cumple_visita = 'SI'::text) AS visitas_validas,
    ( SELECT count(DISTINCT i.customer_id) AS count
           FROM interacciones i
          WHERE i.correo_stratis = u.correo) AS clientes_trabajados,
    round(100.0 * (( SELECT count(*) AS count
           FROM interacciones i
          WHERE i.correo_stratis = u.correo AND i.resultado = 'efectivo'::text))::numeric / NULLIF(( SELECT count(*) AS count
           FROM interacciones i
          WHERE i.correo_stratis = u.correo), 0)::numeric, 1) AS pct_efectividad
   FROM usuarios u
  WHERE rol = 'Ejecutivo'::text;

create or replace view public.v_linea_tiempo as
 WITH g AS (
         SELECT i.customer_id,
            min(i.fecha_contacto) FILTER (WHERE i.inferida IS FALSE) AS t_primera,
            min(i.fecha_contacto) FILTER (WHERE i.inferida IS FALSE AND i.destinatario = 'bbva'::text) AS t_bbva,
            min(i.fecha_contacto) FILTER (WHERE i.inferida IS FALSE AND i.destinatario = 'bbva'::text AND i.resultado = 'bbva_respondio'::text) AS t_bbva_ok,
            min(i.fecha_contacto) FILTER (WHERE i.inferida IS FALSE AND i.destinatario = 'cliente'::text) AS t_cliente,
            min(i.fecha_contacto) FILTER (WHERE i.inferida IS FALSE AND i.destinatario = 'cliente'::text AND i.resultado = 'efectivo'::text) AS t_respondio,
            min(i.fecha_contacto) FILTER (WHERE i.inferida IS FALSE AND i.cumple_visita = 'SI'::text) AS t_visita,
            max(i.fecha_contacto) FILTER (WHERE i.inferida IS FALSE) AS t_ultima,
            count(*) FILTER (WHERE i.inferida IS FALSE AND i.destinatario = 'cliente'::text) AS n_cliente,
            count(*) FILTER (WHERE i.inferida IS FALSE AND i.destinatario = 'cliente'::text AND i.resultado = 'efectivo'::text) AS n_efectivas,
            count(*) FILTER (WHERE i.inferida IS FALSE AND i.destinatario = 'bbva'::text) AS n_bbva,
            count(*) FILTER (WHERE i.inferida) AS n_reconstruidas,
            min(i.fecha_contacto) FILTER (WHERE i.inferida IS FALSE AND i.copia_bbva) AS t_destrabe,
            count(*) FILTER (WHERE i.inferida IS FALSE AND i.copia_bbva) AS n_destrabes
           FROM interacciones i
          GROUP BY i.customer_id
        )
 SELECT c.customer_id,
    c.nombre_comercio,
    c.distrito,
    c.rubro,
    c.tipo_registro,
    c.asignado,
    c.asignado_correo,
    c.estado AS estado_cliente,
    c.resultado_gestion,
    c.cerrado_en::date AS t_cierre,
    g.t_primera,
    g.t_bbva,
    g.t_bbva_ok,
    g.t_cliente,
    g.t_respondio,
    g.t_visita,
    g.t_ultima,
    COALESCE(g.n_cliente, 0::bigint) AS gestiones_al_cliente,
    COALESCE(g.n_efectivas, 0::bigint) AS gestiones_efectivas,
    COALESCE(g.n_bbva, 0::bigint) AS coordinaciones_bbva,
    COALESCE(g.n_reconstruidas, 0::bigint) AS filas_reconstruidas,
        CASE
            WHEN c.resultado_gestion = 'VENTA'::text THEN '8 Venta'::text
            WHEN c.resultado_gestion = 'RETENIDO'::text THEN '7 Retenido'::text
            WHEN c.resultado_gestion = 'PERDIDO'::text THEN '9 Perdido'::text
            WHEN g.t_respondio IS NOT NULL THEN '6 Respondio'::text
            WHEN g.t_cliente IS NOT NULL THEN '5 En contacto'::text
            WHEN g.t_bbva_ok IS NOT NULL THEN '4 Habilitado por el banco'::text
            WHEN g.t_bbva IS NOT NULL THEN '3 Esperando a BBVA'::text
            WHEN g.t_primera IS NOT NULL THEN '2 Con actividad'::text
            ELSE '1 Registrado sin tocar'::text
        END AS etapa,
        CASE
            WHEN g.t_bbva IS NOT NULL AND g.t_bbva_ok IS NOT NULL THEN g.t_bbva_ok - g.t_bbva
            ELSE NULL::integer
        END AS dias_espera_bbva,
        CASE
            WHEN g.t_cliente IS NOT NULL AND g.t_respondio IS NOT NULL THEN g.t_respondio - g.t_cliente
            ELSE NULL::integer
        END AS dias_hasta_respuesta,
        CASE
            WHEN g.t_cliente IS NOT NULL AND g.t_bbva_ok IS NULL THEN true
            ELSE false
        END AS salio_sin_respuesta_del_banco,
    g.t_destrabe,
    COALESCE(g.n_destrabes, 0::bigint) AS destrabes
   FROM clientes c
     LEFT JOIN g ON g.customer_id = c.customer_id;

create or replace view public.v_viaticos as
 SELECT correo_stratis,
    ejecutivo,
    date_trunc('month'::text, fecha_contacto::timestamp with time zone)::date AS mes,
    count(*) FILTER (WHERE COALESCE(gasto_total, 0::numeric) > 0::numeric) AS visitas_con_gasto,
    COALESCE(sum(gasto_total), 0::numeric) AS total,
    COALESCE(sum(COALESCE(array_length(gastos_paths, 1), 0)), 0::bigint) AS comprobantes
   FROM interacciones i
  GROUP BY correo_stratis, ejecutivo, (date_trunc('month'::text, fecha_contacto::timestamp with time zone)::date);

-- ===================== TRIGGERS =====================
CREATE TRIGGER tg_auditar_bono_param AFTER INSERT OR UPDATE ON public.bono_parametros FOR EACH ROW EXECUTE FUNCTION fn_auditar_bono_param();
CREATE TRIGGER tg_bono_param_sello BEFORE INSERT OR UPDATE ON public.bono_parametros FOR EACH ROW EXECUTE FUNCTION fn_bono_param_sello();
CREATE TRIGGER tg_auditar_cliente AFTER UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_auditar_cliente();
CREATE TRIGGER tg_auditar_cliente_borrado BEFORE DELETE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_auditar_cliente();
CREATE TRIGGER tg_auditar_z_canal AFTER UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_auditar_canal_bbva();
CREATE TRIGGER tg_cerrar_seguimiento_cliente AFTER UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_cerrar_seguimiento_cliente();
CREATE TRIGGER tg_cierre_no_futuro BEFORE INSERT OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_cierre_no_futuro();
CREATE TRIGGER tg_contacto_bbva BEFORE INSERT OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_contacto_bbva();
CREATE TRIGGER tg_coordinacion_inicial AFTER INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_coordinacion_inicial();
CREATE TRIGGER tg_llave_inmutable BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_llave_inmutable();
CREATE TRIGGER tg_perdido_con_motivo BEFORE INSERT OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_perdido_con_motivo();
CREATE TRIGGER tg_reglas_cliente BEFORE INSERT OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_reglas_cliente();
CREATE TRIGGER tg_sellar_cierre BEFORE INSERT OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_sellar_cierre();
CREATE TRIGGER tg_zz_convertir_venta BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_convertir_venta();
CREATE TRIGGER tg_zz_corregir_ruc BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_corregir_ruc();
CREATE TRIGGER tg_vinculo_mismo_ejecutivo BEFORE INSERT OR UPDATE ON public.comercios_vinculados FOR EACH ROW EXECUTE FUNCTION fn_vinculo_mismo_ejecutivo();
CREATE TRIGGER tg_facturacion_sello BEFORE INSERT OR UPDATE ON public.facturacion FOR EACH ROW EXECUTE FUNCTION fn_facturacion_sello();
CREATE TRIGGER tg_auditar_fact_base AFTER INSERT OR UPDATE ON public.facturacion_base FOR EACH ROW EXECUTE FUNCTION fn_auditar_fact_base();
CREATE TRIGGER tg_fact_base_sello BEFORE INSERT OR UPDATE ON public.facturacion_base FOR EACH ROW EXECUTE FUNCTION fn_fact_base_sello();
CREATE TRIGGER tg_auditar_interaccion AFTER DELETE OR UPDATE ON public.interacciones FOR EACH ROW EXECUTE FUNCTION fn_auditar_interaccion();
CREATE TRIGGER tg_cerrar_seguimiento AFTER INSERT ON public.interacciones FOR EACH ROW WHEN ((new.con = 'CLIENTE'::text)) EXECUTE FUNCTION fn_cerrar_seguimiento();
CREATE TRIGGER tg_cierre_sin_respaldo AFTER DELETE ON public.interacciones FOR EACH ROW EXECUTE FUNCTION fn_cierre_sin_respaldo();
CREATE TRIGGER tg_fecha_no_futura BEFORE INSERT OR UPDATE ON public.interacciones FOR EACH ROW EXECUTE FUNCTION fn_fecha_no_futura();
CREATE TRIGGER tg_reglas_interaccion BEFORE INSERT OR UPDATE ON public.interacciones FOR EACH ROW WHEN ((COALESCE(current_setting('app.corrigiendo_customer_id'::text, true), ''::text) IS DISTINCT FROM new.customer_id)) EXECUTE FUNCTION fn_reglas_interaccion();
CREATE TRIGGER tg_respuesta_con_prueba BEFORE INSERT OR UPDATE ON public.interacciones FOR EACH ROW EXECUTE FUNCTION fn_respuesta_con_prueba();
CREATE TRIGGER tg_restaurar_fecha_corregida BEFORE UPDATE ON public.interacciones FOR EACH ROW EXECUTE FUNCTION fn_restaurar_fecha_corregida();
CREATE TRIGGER tg_restaurar_gestion_corregida BEFORE UPDATE ON public.interacciones FOR EACH ROW EXECUTE FUNCTION fn_restaurar_gestion_corregida();
CREATE TRIGGER tg_zz_anular_ubicacion BEFORE UPDATE ON public.interacciones FOR EACH ROW EXECUTE FUNCTION fn_anular_ubicacion();
CREATE TRIGGER tg_zz_ubicacion_exenta BEFORE UPDATE ON public.interacciones FOR EACH ROW EXECUTE FUNCTION fn_ubicacion_exenta_solo_rpc();
CREATE TRIGGER tg_normalizar_periodo BEFORE INSERT OR UPDATE ON public.metas FOR EACH ROW EXECUTE FUNCTION fn_normalizar_periodo();
CREATE TRIGGER tg_auditar_cierre AFTER INSERT OR UPDATE ON public.periodos_cerrados FOR EACH ROW EXECUTE FUNCTION fn_auditar_cierre();
CREATE TRIGGER tg_cierre_sello BEFORE INSERT OR UPDATE ON public.periodos_cerrados FOR EACH ROW EXECUTE FUNCTION fn_cierre_sello();
CREATE TRIGGER tg_auditar_reporte AFTER INSERT OR UPDATE ON public.reporte_config FOR EACH ROW EXECUTE FUNCTION fn_auditar_reporte();
CREATE TRIGGER tg_reporte_sello BEFORE INSERT OR UPDATE ON public.reporte_config FOR EACH ROW EXECUTE FUNCTION fn_reporte_sello();
CREATE TRIGGER tg_reglas_seguimiento BEFORE INSERT OR UPDATE ON public.seguimientos FOR EACH ROW WHEN ((COALESCE(current_setting('app.corrigiendo_customer_id'::text, true), ''::text) IS DISTINCT FROM new.customer_id)) EXECUTE FUNCTION fn_reglas_seguimiento();
CREATE TRIGGER v2_feedback_inferido_valida BEFORE INSERT OR UPDATE ON public.v2_feedback_inferido FOR EACH ROW EXECUTE FUNCTION v2_feedback_inferido_valida();
CREATE TRIGGER tg_v2_geo_visita AFTER INSERT ON public.v2_visitas FOR EACH ROW EXECUTE FUNCTION v2_fijar_geo_por_visita();
CREATE TRIGGER tg_v2_plazo_visita BEFORE INSERT ON public.v2_visitas FOR EACH ROW EXECUTE FUNCTION v2_fijar_plazo_visita();
CREATE TRIGGER tg_v2_ref_visita BEFORE INSERT ON public.v2_visitas FOR EACH ROW EXECUTE FUNCTION v2_fijar_ref_visita();
CREATE TRIGGER tg_v2_validacion_auto BEFORE INSERT ON public.v2_visitas FOR EACH ROW EXECUTE FUNCTION v2_validacion_automatica();
CREATE TRIGGER v2_revision_tras_correccion BEFORE UPDATE ON public.v2_visitas FOR EACH ROW EXECUTE FUNCTION v2_revision_tras_correccion();

-- ===================== POLÍTICAS RLS =====================
create policy p_acc_select on public.acciones_seguimiento as permissive for select to public
  using (es_usuario_activo());
create policy p_acc_write on public.acciones_seguimiento as permissive for all to public
  using (es_admin())
  with check (es_admin());
create policy p_aud_select on public.auditoria as permissive for select to authenticated
  using (es_admin());
create policy p_bono_param_all on public.bono_parametros as permissive for all to public
  using (es_admin())
  with check (es_admin());
create policy p_clientes_delete on public.clientes as permissive for delete to public
  using ((es_usuario_activo() AND ((asignado_correo = correo_actual()) OR (es_admin() AND (regexp_replace(customer_id, '^NUEVO-'::text, ''::text) ~ '^0000'::text)))));
create policy p_clientes_insert on public.clientes as permissive for insert to public
  with check (((es_ejecutivo() AND (tipo_registro = 'CARTERA'::text)) OR (es_admin() AND (regexp_replace(customer_id, '^NUEVO-'::text, ''::text) ~ '^0000'::text))));
create policy p_clientes_select on public.clientes as permissive for select to authenticated
  using ((es_usuario_activo() AND (es_admin() OR (asignado_correo = correo_actual()))));
create policy p_clientes_update on public.clientes as permissive for update to authenticated
  using ((es_usuario_activo() AND (es_admin() OR (asignado_correo = correo_actual()))))
  with check ((es_admin() OR (asignado_correo = correo_actual())));
create policy comercios_vinculados_escritura on public.comercios_vinculados as permissive for all to authenticated
  using (( SELECT private.es_supervision() AS es_supervision))
  with check (( SELECT private.es_supervision() AS es_supervision));
create policy comercios_vinculados_lectura on public.comercios_vinculados as permissive for select to authenticated
  using (true);
create policy p_config_admin on public.config as permissive for all to public
  using (es_admin())
  with check (es_admin());
create policy p_config_select on public.config as permissive for select to authenticated
  using (true);
create policy p_fact_all on public.facturacion as permissive for all to public
  using (es_admin())
  with check (es_admin());
create policy p_fact_base_all on public.facturacion_base as permissive for all to public
  using (es_admin())
  with check (es_admin());
create policy p_inter_delete on public.interacciones as permissive for delete to public
  using ((es_usuario_activo() AND (es_admin() OR ((correo_stratis = correo_actual()) AND (COALESCE(creado_en, now()) > (now() - '7 days'::interval))))));
create policy p_inter_insert on public.interacciones as permissive for insert to authenticated
  with check ((es_usuario_activo() AND (correo_stratis = correo_actual()) AND (es_admin() OR (es_ejecutivo() AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.customer_id = interacciones.customer_id) AND (c.asignado_correo = correo_actual()))))))));
create policy p_inter_select on public.interacciones as permissive for select to authenticated
  using ((es_usuario_activo() AND (es_admin() OR (correo_stratis = correo_actual()))));
create policy p_inter_update on public.interacciones as permissive for update to public
  using ((es_usuario_activo() AND (es_admin() OR ((correo_stratis = correo_actual()) AND (COALESCE(creado_en, now()) > (now() - '7 days'::interval))))))
  with check ((es_usuario_activo() AND (es_admin() OR ((correo_stratis = correo_actual()) AND (COALESCE(creado_en, now()) > (now() - '7 days'::interval))))));
create policy p_metas_delete on public.metas as permissive for delete to authenticated
  using (es_admin());
create policy p_metas_insert on public.metas as permissive for insert to authenticated
  with check (es_admin());
create policy p_metas_select on public.metas as permissive for select to authenticated
  using ((es_admin() OR (correo = correo_actual())));
create policy p_metas_update on public.metas as permissive for update to authenticated
  using (es_admin())
  with check (es_admin());
create policy p_cierre_all on public.periodos_cerrados as permissive for all to public
  using (es_admin())
  with check (es_admin());
create policy p_reporte_all on public.reporte_config as permissive for all to public
  using (es_admin())
  with check (es_admin());
create policy p_rubros_select on public.rubros as permissive for select to authenticated
  using (true);
create policy p_seg_delete on public.seguimientos as permissive for delete to public
  using ((es_usuario_activo() AND (correo_stratis = correo_actual())));
create policy p_seg_insert on public.seguimientos as permissive for insert to public
  with check ((es_ejecutivo() AND (correo_stratis = correo_actual())));
create policy p_seg_select on public.seguimientos as permissive for select to public
  using ((es_usuario_activo() AND (es_admin() OR (correo_stratis = correo_actual()))));
create policy p_seg_update on public.seguimientos as permissive for update to public
  using ((es_usuario_activo() AND (es_admin() OR (correo_stratis = correo_actual()))));
create policy p_usuarios_select on public.usuarios as permissive for select to authenticated
  using (((correo = correo_actual()) OR es_admin()));
create policy v2_asi_adm on public.v2_asignaciones as permissive for all to authenticated
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_asi_sel on public.v2_asignaciones as permissive for select to authenticated
  using ((( SELECT es_usuario_activo() AS es_usuario_activo) AND ((correo IS NULL) OR (correo = ( SELECT correo_actual() AS correo_actual)))));
create policy v2_bit_adm on public.v2_bitacora_visita as permissive for all to public
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_bit_sel on public.v2_bitacora_visita as permissive for select to public
  using ((( SELECT es_admin() AS es_admin) OR (EXISTS ( SELECT 1
   FROM v2_visitas v
  WHERE ((v.id = v2_bitacora_visita.visita_id) AND (v.correo = ( SELECT correo_actual() AS correo_actual)))))));
create policy v2_car_adm on public.v2_cargas as permissive for all to authenticated
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_com_adm on public.v2_comercios as permissive for all to authenticated
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_com_sel on public.v2_comercios as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM v2_asignaciones a
  WHERE ((a.customer_id = v2_comercios.customer_id) AND ((a.correo IS NULL) OR (a.correo = ( SELECT correo_actual() AS correo_actual)))))));
create policy v2_cor_adm on public.v2_correcciones as permissive for all to authenticated
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_cor_sel on public.v2_correcciones as permissive for select to authenticated
  using ((por = ( SELECT correo_actual() AS correo_actual)));
create policy v2_dir_extra_admin on public.v2_direcciones_extra as permissive for select to authenticated
  using (es_admin());
create policy v2_fb_reorg_lectura on public.v2_fb_reorganizacion as permissive for select to authenticated
  using (v2_puede_escritorio());
create policy v2_fb_segmentacion_lectura on public.v2_fb_segmentacion as permissive for select to authenticated
  using (v2_puede_escritorio());
create policy v2_feedback_acciones_lectura on public.v2_feedback_acciones as permissive for select to authenticated
  using (es_usuario_activo());
create policy v2_feedback_inferido_lectura on public.v2_feedback_inferido as permissive for select to authenticated
  using (v2_puede_escritorio());
create policy v2_feedback_tipos_lectura on public.v2_feedback_tipos as permissive for select to authenticated
  using (es_usuario_activo());
create policy v2_fer_adm on public.v2_feriados as permissive for all to public
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_fer_sel on public.v2_feriados as permissive for select to public
  using (( SELECT es_usuario_activo() AS es_usuario_activo));
create policy v2_geo_distritos_leer on public.v2_geo_distritos as permissive for select to authenticated
  using (v2_puede_escritorio());
create policy v2_limpieza_lectura on public.v2_limpieza_marcaciones as permissive for select to authenticated
  using (v2_puede_escritorio());
create policy v2_motivo_si_inferido_lectura on public.v2_motivo_si_inferido as permissive for select to authenticated
  using (v2_puede_escritorio());
create policy v2_motivo_si_lectura on public.v2_motivo_si_tipos as permissive for select to authenticated
  using (es_usuario_activo());
create policy v2_par_adm on public.v2_parametros as permissive for all to public
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_par_sel on public.v2_parametros as permissive for select to public
  using (( SELECT es_usuario_activo() AS es_usuario_activo));
create policy v2_per_adm on public.v2_periodos as permissive for all to authenticated
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_per_sel on public.v2_periodos as permissive for select to authenticated
  using (( SELECT es_usuario_activo() AS es_usuario_activo));
create policy v2_sunat_adm on public.v2_sunat as permissive for all to public
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_sunat_sel on public.v2_sunat as permissive for select to public
  using (( SELECT es_admin() AS es_admin));
create policy v2_trx_adm on public.v2_transacciones as permissive for all to authenticated
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_verif_maps_admin on public.v2_verificacion_maps as permissive for select to authenticated
  using (es_admin());
create policy v2_vis_adm on public.v2_visitas as permissive for all to authenticated
  using (( SELECT es_admin() AS es_admin))
  with check (( SELECT es_admin() AS es_admin));
create policy v2_vis_sel on public.v2_visitas as permissive for select to authenticated
  using ((correo = ( SELECT correo_actual() AS correo_actual)));

-- ===================== PERMISOS DE FUNCIONES =====================
grant execute on function ahora_lima() to anon;
grant execute on function ahora_lima() to authenticated;
grant execute on function ahora_lima() to service_role;
grant execute on function anular_ubicacion(uuid,text) to authenticated;
grant execute on function anular_ubicacion(uuid,text) to service_role;
grant execute on function cfg(text) to anon;
grant execute on function cfg(text) to authenticated;
grant execute on function cfg(text) to service_role;
grant execute on function convertir_a_venta_nueva(text,text,text) to authenticated;
grant execute on function convertir_a_venta_nueva(text,text,text) to service_role;
grant execute on function corregir_customer_id(text,text) to authenticated;
grant execute on function corregir_customer_id(text,text) to service_role;
grant execute on function corregir_fecha_gestion(uuid,date,text) to authenticated;
grant execute on function corregir_fecha_gestion(uuid,date,text) to service_role;
grant execute on function corregir_gestion(uuid,text,text,time without time zone) to authenticated;
grant execute on function corregir_gestion(uuid,text,text,time without time zone) to service_role;
grant execute on function corregir_ruc(text,text) to authenticated;
grant execute on function corregir_ruc(text,text) to service_role;
grant execute on function correo_actual() to anon;
grant execute on function correo_actual() to authenticated;
grant execute on function correo_actual() to service_role;
grant execute on function crear_prospecto(text,text,text,text,text) to anon;
grant execute on function crear_prospecto(text,text,text,text,text) to authenticated;
grant execute on function crear_prospecto(text,text,text,text,text) to service_role;
grant execute on function crear_venta_nueva(text,text,text,text,text,date,time without time zone,text,text,text,text,text,boolean,numeric,text[]) to anon;
grant execute on function crear_venta_nueva(text,text,text,text,text,date,time without time zone,text,text,text,text,text,boolean,numeric,text[]) to authenticated;
grant execute on function crear_venta_nueva(text,text,text,text,text,date,time without time zone,text,text,text,text,text,boolean,numeric,text[]) to service_role;
grant execute on function desde_reglas_25() to anon;
grant execute on function desde_reglas_25() to authenticated;
grant execute on function desde_reglas_25() to service_role;
grant execute on function edicion_libre() to anon;
grant execute on function edicion_libre() to authenticated;
grant execute on function edicion_libre() to service_role;
grant execute on function es_admin() to anon;
grant execute on function es_admin() to authenticated;
grant execute on function es_admin() to service_role;
grant execute on function es_ejecutivo() to anon;
grant execute on function es_ejecutivo() to authenticated;
grant execute on function es_ejecutivo() to service_role;
grant execute on function es_usuario_activo() to anon;
grant execute on function es_usuario_activo() to authenticated;
grant execute on function es_usuario_activo() to service_role;
grant execute on function eximir_ubicacion(uuid,text) to anon;
grant execute on function eximir_ubicacion(uuid,text) to authenticated;
grant execute on function eximir_ubicacion(uuid,text) to service_role;
grant execute on function fijar_ubicacion(uuid,text,text) to authenticated;
grant execute on function fijar_ubicacion(uuid,text,text) to service_role;
grant execute on function fn_anular_ubicacion() to anon;
grant execute on function fn_anular_ubicacion() to authenticated;
grant execute on function fn_anular_ubicacion() to service_role;
grant execute on function fn_auditar_bono_param() to anon;
grant execute on function fn_auditar_bono_param() to authenticated;
grant execute on function fn_auditar_bono_param() to service_role;
grant execute on function fn_auditar_canal_bbva() to anon;
grant execute on function fn_auditar_canal_bbva() to authenticated;
grant execute on function fn_auditar_canal_bbva() to service_role;
grant execute on function fn_auditar_cierre() to anon;
grant execute on function fn_auditar_cierre() to authenticated;
grant execute on function fn_auditar_cierre() to service_role;
grant execute on function fn_auditar_cliente() to anon;
grant execute on function fn_auditar_cliente() to authenticated;
grant execute on function fn_auditar_cliente() to service_role;
grant execute on function fn_auditar_fact_base() to anon;
grant execute on function fn_auditar_fact_base() to authenticated;
grant execute on function fn_auditar_fact_base() to service_role;
grant execute on function fn_auditar_interaccion() to anon;
grant execute on function fn_auditar_interaccion() to authenticated;
grant execute on function fn_auditar_interaccion() to service_role;
grant execute on function fn_auditar_reporte() to anon;
grant execute on function fn_auditar_reporte() to authenticated;
grant execute on function fn_auditar_reporte() to service_role;
grant execute on function fn_bono_param_sello() to anon;
grant execute on function fn_bono_param_sello() to authenticated;
grant execute on function fn_bono_param_sello() to service_role;
grant execute on function fn_cerrar_seguimiento_cliente() to anon;
grant execute on function fn_cerrar_seguimiento_cliente() to authenticated;
grant execute on function fn_cerrar_seguimiento_cliente() to service_role;
grant execute on function fn_cerrar_seguimiento() to anon;
grant execute on function fn_cerrar_seguimiento() to authenticated;
grant execute on function fn_cerrar_seguimiento() to service_role;
grant execute on function fn_cierre_no_futuro() to anon;
grant execute on function fn_cierre_no_futuro() to authenticated;
grant execute on function fn_cierre_no_futuro() to service_role;
grant execute on function fn_cierre_sello() to anon;
grant execute on function fn_cierre_sello() to authenticated;
grant execute on function fn_cierre_sello() to service_role;
grant execute on function fn_cierre_sin_respaldo() to anon;
grant execute on function fn_cierre_sin_respaldo() to authenticated;
grant execute on function fn_cierre_sin_respaldo() to service_role;
grant execute on function fn_contacto_bbva() to anon;
grant execute on function fn_contacto_bbva() to authenticated;
grant execute on function fn_contacto_bbva() to service_role;
grant execute on function fn_convertir_venta() to anon;
grant execute on function fn_convertir_venta() to authenticated;
grant execute on function fn_convertir_venta() to service_role;
grant execute on function fn_coordinacion_inicial() to anon;
grant execute on function fn_coordinacion_inicial() to authenticated;
grant execute on function fn_coordinacion_inicial() to service_role;
grant execute on function fn_corregir_ruc() to anon;
grant execute on function fn_corregir_ruc() to authenticated;
grant execute on function fn_corregir_ruc() to service_role;
grant execute on function fn_fact_base_sello() to anon;
grant execute on function fn_fact_base_sello() to authenticated;
grant execute on function fn_fact_base_sello() to service_role;
grant execute on function fn_facturacion_sello() to anon;
grant execute on function fn_facturacion_sello() to authenticated;
grant execute on function fn_facturacion_sello() to service_role;
grant execute on function fn_fecha_no_futura() to anon;
grant execute on function fn_fecha_no_futura() to authenticated;
grant execute on function fn_fecha_no_futura() to service_role;
grant execute on function fn_llave_inmutable() to anon;
grant execute on function fn_llave_inmutable() to authenticated;
grant execute on function fn_llave_inmutable() to service_role;
grant execute on function fn_normalizar_periodo() to anon;
grant execute on function fn_normalizar_periodo() to authenticated;
grant execute on function fn_normalizar_periodo() to service_role;
grant execute on function fn_perdido_con_motivo() to anon;
grant execute on function fn_perdido_con_motivo() to authenticated;
grant execute on function fn_perdido_con_motivo() to service_role;
grant execute on function fn_reglas_cliente() to anon;
grant execute on function fn_reglas_cliente() to authenticated;
grant execute on function fn_reglas_cliente() to service_role;
grant execute on function fn_reglas_interaccion() to anon;
grant execute on function fn_reglas_interaccion() to authenticated;
grant execute on function fn_reglas_interaccion() to service_role;
grant execute on function fn_reglas_seguimiento() to anon;
grant execute on function fn_reglas_seguimiento() to authenticated;
grant execute on function fn_reglas_seguimiento() to service_role;
grant execute on function fn_reporte_sello() to anon;
grant execute on function fn_reporte_sello() to authenticated;
grant execute on function fn_reporte_sello() to service_role;
grant execute on function fn_respuesta_con_prueba() to anon;
grant execute on function fn_respuesta_con_prueba() to authenticated;
grant execute on function fn_respuesta_con_prueba() to service_role;
grant execute on function fn_restaurar_fecha_corregida() to anon;
grant execute on function fn_restaurar_fecha_corregida() to authenticated;
grant execute on function fn_restaurar_fecha_corregida() to service_role;
grant execute on function fn_restaurar_gestion_corregida() to anon;
grant execute on function fn_restaurar_gestion_corregida() to authenticated;
grant execute on function fn_restaurar_gestion_corregida() to service_role;
grant execute on function fn_sellar_cierre() to anon;
grant execute on function fn_sellar_cierre() to authenticated;
grant execute on function fn_sellar_cierre() to service_role;
grant execute on function fn_solo_equipo_stratis() to anon;
grant execute on function fn_solo_equipo_stratis() to authenticated;
grant execute on function fn_solo_equipo_stratis() to service_role;
grant execute on function fn_ubicacion_exenta_solo_rpc() to anon;
grant execute on function fn_ubicacion_exenta_solo_rpc() to authenticated;
grant execute on function fn_ubicacion_exenta_solo_rpc() to service_role;
grant execute on function fn_vinculo_mismo_ejecutivo() to anon;
grant execute on function fn_vinculo_mismo_ejecutivo() to authenticated;
grant execute on function fn_vinculo_mismo_ejecutivo() to service_role;
grant execute on function gestion_editable(timestamp with time zone) to anon;
grant execute on function gestion_editable(timestamp with time zone) to authenticated;
grant execute on function gestion_editable(timestamp with time zone) to service_role;
grant execute on function pulso() to authenticated;
grant execute on function pulso() to service_role;
grant execute on function v2_actividad(date,date) to authenticated;
grant execute on function v2_actividad(date,date) to service_role;
grant execute on function v2_actualizar_ubicacion(uuid,double precision,double precision,numeric) to authenticated;
grant execute on function v2_actualizar_ubicacion(uuid,double precision,double precision,numeric) to service_role;
grant execute on function v2_anular_visita(uuid,text,text) to anon;
grant execute on function v2_anular_visita(uuid,text,text) to authenticated;
grant execute on function v2_anular_visita(uuid,text,text) to service_role;
grant execute on function v2_avance(text) to anon;
grant execute on function v2_avance(text) to authenticated;
grant execute on function v2_avance(text) to service_role;
grant execute on function v2_cargar_geo_distritos(jsonb) to authenticated;
grant execute on function v2_cargar_geo_distritos(jsonb) to service_role;
grant execute on function v2_cargar_transacciones(text,text,jsonb,text) to anon;
grant execute on function v2_cargar_transacciones(text,text,jsonb,text) to authenticated;
grant execute on function v2_cargar_transacciones(text,text,jsonb,text) to service_role;
grant execute on function v2_corregir_comercio(text,text,text,text,text) to authenticated;
grant execute on function v2_corregir_comercio(text,text,text,text,text) to service_role;
grant execute on function v2_dias_trx(text,text) to authenticated;
grant execute on function v2_dias_trx(text,text) to service_role;
grant execute on function v2_editar_comentario(uuid,text) to anon;
grant execute on function v2_editar_comentario(uuid,text) to authenticated;
grant execute on function v2_editar_comentario(uuid,text) to service_role;
grant execute on function v2_editar_resultado(uuid,text,text,text,text,text,date,text,text[],text,text[],text[],jsonb) to authenticated;
grant execute on function v2_editar_resultado(uuid,text,text,text,text,text,date,text,text[],text,text[],text[],jsonb) to service_role;
grant execute on function v2_fb_acciones_limpio(text[],text[]) to authenticated;
grant execute on function v2_fb_acciones_limpio(text[],text[]) to service_role;
grant execute on function v2_fb_extra_limpio(jsonb,text[]) to authenticated;
grant execute on function v2_fb_extra_limpio(jsonb,text[]) to service_role;
grant execute on function v2_feedback_inferido_valida() to anon;
grant execute on function v2_feedback_inferido_valida() to authenticated;
grant execute on function v2_feedback_inferido_valida() to service_role;
grant execute on function v2_feedback_limpio(text[],text) to authenticated;
grant execute on function v2_feedback_limpio(text[],text) to service_role;
grant execute on function v2_fijar_geo_por_visita() to anon;
grant execute on function v2_fijar_geo_por_visita() to authenticated;
grant execute on function v2_fijar_geo_por_visita() to service_role;
grant execute on function v2_fijar_plazo_visita() to anon;
grant execute on function v2_fijar_plazo_visita() to authenticated;
grant execute on function v2_fijar_plazo_visita() to service_role;
grant execute on function v2_fijar_ref_visita() to anon;
grant execute on function v2_fijar_ref_visita() to authenticated;
grant execute on function v2_fijar_ref_visita() to service_role;
grant execute on function v2_limite_habil(date,integer) to anon;
grant execute on function v2_limite_habil(date,integer) to authenticated;
grant execute on function v2_limite_habil(date,integer) to service_role;
grant execute on function v2_metros(double precision,double precision,double precision,double precision) to anon;
grant execute on function v2_metros(double precision,double precision,double precision,double precision) to authenticated;
grant execute on function v2_metros(double precision,double precision,double precision,double precision) to service_role;
grant execute on function v2_mi_base(text) to anon;
grant execute on function v2_mi_base(text) to authenticated;
grant execute on function v2_mi_base(text) to service_role;
grant execute on function v2_mis_revisiones(text) to anon;
grant execute on function v2_mis_revisiones(text) to authenticated;
grant execute on function v2_mis_revisiones(text) to service_role;
grant execute on function v2_motivos_si_limpio(text[],text) to authenticated;
grant execute on function v2_motivos_si_limpio(text[],text) to service_role;
grant execute on function v2_pedir_anulacion(uuid,text) to anon;
grant execute on function v2_pedir_anulacion(uuid,text) to authenticated;
grant execute on function v2_pedir_anulacion(uuid,text) to service_role;
grant execute on function v2_periodo_de(date) to anon;
grant execute on function v2_periodo_de(date) to authenticated;
grant execute on function v2_periodo_de(date) to service_role;
grant execute on function v2_puede_escritorio() to authenticated;
grant execute on function v2_puede_escritorio() to service_role;
grant execute on function v2_registrar_visita(text,timestamp with time zone,double precision,double precision,numeric,text,text,text,text,text,date,text,text,boolean,text[],text,text[],boolean,text,text[],jsonb,text,jsonb) to authenticated;
grant execute on function v2_registrar_visita(text,timestamp with time zone,double precision,double precision,numeric,text,text,text,text,text,date,text,text,boolean,text[],text,text[],boolean,text,text[],jsonb,text,jsonb) to service_role;
grant execute on function v2_resolver_anulacion(uuid,boolean,text) to anon;
grant execute on function v2_resolver_anulacion(uuid,boolean,text) to authenticated;
grant execute on function v2_resolver_anulacion(uuid,boolean,text) to service_role;
grant execute on function v2_restituir_visita(uuid,text) to anon;
grant execute on function v2_restituir_visita(uuid,text) to authenticated;
grant execute on function v2_restituir_visita(uuid,text) to service_role;
grant execute on function v2_resumen_visita(text,text,text,text,text,date,text) to anon;
grant execute on function v2_resumen_visita(text,text,text,text,text,date,text) to authenticated;
grant execute on function v2_resumen_visita(text,text,text,text,text,date,text) to service_role;
grant execute on function v2_revision_tras_correccion() to anon;
grant execute on function v2_revision_tras_correccion() to authenticated;
grant execute on function v2_revision_tras_correccion() to service_role;
grant execute on function v2_validacion_automatica() to anon;
grant execute on function v2_validacion_automatica() to authenticated;
grant execute on function v2_validacion_automatica() to service_role;
grant execute on function v2_validar_visita(uuid,text,text,text) to anon;
grant execute on function v2_validar_visita(uuid,text,text,text) to authenticated;
grant execute on function v2_validar_visita(uuid,text,text,text) to service_role;
grant execute on function v2_visitas_de(text,text) to authenticated;
grant execute on function v2_visitas_de(text,text) to service_role;
revoke execute on function anular_ubicacion(uuid,text) from public;
revoke execute on function convertir_a_venta_nueva(text,text,text) from public;
revoke execute on function corregir_customer_id(text,text) from public;
revoke execute on function corregir_fecha_gestion(uuid,date,text) from public;
revoke execute on function corregir_gestion(uuid,text,text,time without time zone) from public;
revoke execute on function corregir_ruc(text,text) from public;
revoke execute on function crear_prospecto(text,text,text,text,text) from public;
revoke execute on function crear_venta_nueva(text,text,text,text,text,date,time without time zone,text,text,text,text,text,boolean,numeric,text[]) from public;
revoke execute on function eximir_ubicacion(uuid,text) from public;
revoke execute on function fijar_ubicacion(uuid,text,text) from public;
revoke execute on function pulso() from public;
revoke execute on function v2_actividad(date,date) from public;
revoke execute on function v2_actualizar_ubicacion(uuid,double precision,double precision,numeric) from public;
revoke execute on function v2_cargar_geo_distritos(jsonb) from public;
revoke execute on function v2_corregir_comercio(text,text,text,text,text) from public;
revoke execute on function v2_dias_trx(text,text) from public;
revoke execute on function v2_editar_resultado(uuid,text,text,text,text,text,date,text,text[],text,text[],text[],jsonb) from public;
revoke execute on function v2_fb_acciones_limpio(text[],text[]) from public;
revoke execute on function v2_fb_extra_limpio(jsonb,text[]) from public;
revoke execute on function v2_feedback_limpio(text[],text) from public;
revoke execute on function v2_motivos_si_limpio(text[],text) from public;
revoke execute on function v2_puede_escritorio() from public;
revoke execute on function v2_registrar_visita(text,timestamp with time zone,double precision,double precision,numeric,text,text,text,text,text,date,text,text,boolean,text[],text,text[],boolean,text,text[],jsonb,text,jsonb) from public;
revoke execute on function v2_visitas_de(text,text) from public;
