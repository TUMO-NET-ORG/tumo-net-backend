/* create database tumo_net; */

use tumo_net;

drop table if exists grupo_integrantes;
drop table if exists grupos;
drop table if exists token_recuperacion;
drop table if exists verificacion_email;
drop table if exists usuarios;
drop table if exists estado_usuario;
drop table if exists roles;

create table roles (
  id int unsigned auto_increment primary key,
  codigo varchar(30) not null,
  nombre varchar(60) not null,
  unique key uk_rol_codigo (codigo)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table estado_usuario (
  id int unsigned auto_increment primary key,
  codigo varchar(30) not null,
  nombre varchar(60) not null,
  unique key uk_estado_usuario_codigo (codigo)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;

insert into roles (codigo, nombre) values
('superadmin', 'Superadmin'),
('administrador', 'Administrador'),
  ('alumno', 'Alumno'),
  ('staff', 'Staff'),
  ('tutor', 'Tutor o líder de taller');

insert into estado_usuario (codigo, nombre) values
  ('activo', 'Activo'),
  ('inactivo', 'Inactivo'),
  ('suspendido', 'Suspendido'),
  ('pendiente_verificacion', 'Pendiente verificacion mail'),
  ('dado_de_baja', 'Dado de baja');

create table usuarios (
  id int unsigned auto_increment primary key,
  nombre varchar(100) not null,
  apellido varchar(100) not null,
  documento varchar(20) not null,
  email varchar(255) not null,
  password_hash varchar(255) not null,
  fecha_nacimiento date null,
  foto_url varchar(500) null,
  url_portfolio varchar(500) null,
  id_rol int unsigned not null,
  id_estado int unsigned not null,
  fecha_alta datetime not null default current_timestamp,
  fecha_aceptacion_terminos datetime null,
  version_terminos varchar(20) null,
  intentos_fallidos int unsigned not null default 0,
  bloqueado_hasta datetime null,
  password_version int unsigned not null default 0,
  debe_cambiar_password tinyint not null default 0,
  unique key uk_usuario_email (email),
  unique key uk_usuario_documento (documento),
  constraint fk_usuario_rol foreign key (id_rol) references roles (id),
  constraint fk_usuario_estado foreign key (id_estado) references estado_usuario (id)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;

-- El primer superadmin se asigna a mano a un usuario existente
-- (ver metadata/migrations/008_superadmin.sql).

create table token_recuperacion (
  id int unsigned auto_increment primary key,
  usuario_id int unsigned not null,
  token_hash char(64) not null,
  tipo varchar(30) not null default 'recuperacion',
  email_pendiente varchar(255) null,
  fecha_expiracion datetime not null,
  fecha_creacion datetime not null default current_timestamp,
  fecha_uso datetime null,
  usado tinyint not null default 0,
  unique key uk_token_hash (token_hash),
  index idx_token_accion_usuario_tipo (usuario_id, tipo, usado),
  index idx_token_recuperacion_usuario_fecha (usuario_id, fecha_creacion),
  constraint fk_token_usuario foreign key (usuario_id)
    references usuarios (id) on delete cascade
);

create table verificacion_email (
  id int unsigned auto_increment primary key,
  usuario_id int unsigned not null,
  codigo_hash char(64) not null,
  fecha_expiracion datetime not null,
  intentos_fallidos int unsigned not null default 0,
  usado tinyint not null default 0,
  fecha_uso datetime null,
  fecha_creacion datetime not null default current_timestamp,
  constraint fk_verificacion_email_usuario
    foreign key (usuario_id)
    references usuarios(id)
    on delete cascade,

  index idx_verificacion_email_usuario (usuario_id),
  index idx_verificacion_email_expiracion (fecha_expiracion),
  index idx_verificacion_email_estado (
    usuario_id,
    usado,
    fecha_expiracion
  )
) engine=innodb
  default charset=utf8mb4
  collate=utf8mb4_unicode_ci;

create table grupos (
  id int unsigned auto_increment primary key,
  nombre varchar(100) not null,
  descripcion varchar(500) null,
  creado_por int unsigned not null,
  fecha_creacion datetime not null default current_timestamp,
  activo tinyint not null default 1,
  unique key uk_grupo_nombre (nombre),
  constraint fk_grupo_creado_por foreign key (creado_por) references usuarios (id)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table grupo_integrantes (
  grupo_id int unsigned not null,
  usuario_id int unsigned not null,
  es_responsable tinyint not null default 0,
  fecha_alta datetime not null default current_timestamp,
  primary key (grupo_id, usuario_id),
  index idx_grupo_integrantes_usuario (usuario_id),
  constraint fk_grupo_integrantes_grupo foreign key (grupo_id)
    references grupos (id) on delete cascade,
  constraint fk_grupo_integrantes_usuario foreign key (usuario_id)
    references usuarios (id)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;
