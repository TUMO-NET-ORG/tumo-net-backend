/* create database tumo_net; */

use tumo_net;

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
('administrador', 'Administrador'),
  ('alumno', 'Alumno'),
  ('staff', 'Staff'),
  ('tutor', 'Tutor o líder de taller');

insert into estado_usuario (codigo, nombre) values
  ('activo', 'Activo'),
  ('inactivo', 'Inactivo'),
  ('suspendido', 'Suspendido'),
  ('pendiente_verificacion', 'Pendiente verificacion mail');

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
  unique key uk_usuario_email (email),
  unique key uk_usuario_documento (documento),
  constraint fk_usuario_rol foreign key (id_rol) references roles (id),
  constraint fk_usuario_estado foreign key (id_estado) references estado_usuario (id)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table token_recuperacion (
  id int unsigned auto_increment primary key,
  usuario_id int unsigned not null,
  token_hash char(64) not null,
  fecha_expiracion datetime not null,
  fecha_creacion datetime not null default current_timestamp,
  fecha_uso datetime null,
  usado tinyint not null default 0,
  unique key uk_token_hash (token_hash),
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
