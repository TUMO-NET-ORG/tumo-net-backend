-- Grupos con responsables (staff, tutor o administrador) e integrantes.
-- Solo para bases creadas ANTES de que estas tablas se agregaran a
-- "sql script.sql". Verificar con: SHOW TABLES LIKE 'grupo%';

create table grupos (
  id int unsigned auto_increment primary key,
  nombre varchar(100) not null,
  descripcion varchar(500) null,
  creado_por int unsigned not null,
  fecha_creacion datetime not null default current_timestamp,
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
