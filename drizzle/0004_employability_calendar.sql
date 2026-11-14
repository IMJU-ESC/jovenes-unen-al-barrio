INSERT INTO activities (id,title,date,time,place,hours,description,category,created_at)
SELECT 'imju-empleabilidad-20261113','Taller de capacitación de empleabilidad','2026-11-13','09:00','Instituto Municipal de la Juventud (Biblioteca Digital)',0,
'Horario: 9:00 a.m. a 12:30 p.m. Acreditación de horas pendiente de coordinación.','aprendizaje',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE id='imju-empleabilidad-20261113' OR (date='2026-11-13' AND lower(title) LIKE '%empleabilidad%'));
--> statement-breakpoint
INSERT INTO activities (id,title,date,time,place,hours,description,category,created_at)
SELECT 'imju-empleabilidad-20261117','Taller de capacitación de empleabilidad','2026-11-17','09:00','Instituto Municipal de la Juventud (Biblioteca Digital)',0,
'Horario: 9:00 a.m. a 12:30 p.m. Acreditación de horas pendiente de coordinación.','aprendizaje',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE id='imju-empleabilidad-20261117' OR (date='2026-11-17' AND lower(title) LIKE '%empleabilidad%'));