use tumo_net;

create table disciplinas (
  id int unsigned auto_increment primary key,
  codigo varchar(30) not null,
  nombre varchar(60) not null,
  unique key uk_disciplina_codigo (codigo)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;

insert into disciplinas (codigo, nombre) values
  ('programacion', 'Programación'),
  ('diseno', 'Diseño'),
  ('animacion', 'Animación'),
  ('robotica', 'Robótica');

create table publicaciones (
  id int unsigned auto_increment primary key,
  usuario_id int unsigned not null,
  disciplina_id int unsigned not null,
  texto varchar(5000) not null,
  enlace_url varchar(500) null,
  fecha_creacion datetime not null default current_timestamp,
  activo tinyint not null default 1,
  fecha_eliminacion datetime null,
  eliminado_por int unsigned null,
  constraint fk_publicacion_usuario foreign key (usuario_id) references usuarios (id),
  constraint fk_publicacion_disciplina foreign key (disciplina_id) references disciplinas (id),
  constraint fk_publicacion_eliminada_por foreign key (eliminado_por) references usuarios (id),
  index idx_publicacion_activa_fecha (activo, fecha_creacion),
  index idx_publicacion_disciplina (disciplina_id)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table publicacion_imagenes (
  id int unsigned auto_increment primary key,
  publicacion_id int unsigned not null,
  nombre_archivo varchar(255) not null,
  url varchar(500) not null,
  tipo_mime varchar(100) not null,
  tamanio int unsigned not null,
  fecha_creacion datetime not null default current_timestamp,
  constraint fk_publicacion_imagen_publicacion foreign key (publicacion_id)
    references publicaciones (id) on delete cascade
) engine=innodb default charset=utf8mb4 collate=utf8mb4_unicode_ci;
