-- 009_drop_evaluaciones.sql
-- Removes the score feature.
-- Inbound foreign keys and views are dropped from information_schema, because
-- MySQL can prepare those statements. Procedures, functions, triggers and events
-- cannot be dropped through PREPARE on this server, so the known procedure is
-- dropped directly. Any other leftover dependent stops the script before the
-- table drop. Student and reservation rows are not modified.
-- Triggers defined on dual_evaluaciones are removed with the table.

USE `proyecto_dual`;

DROP PROCEDURE IF EXISTS `sp_guardar_evaluacion`;

DROP PROCEDURE IF EXISTS `sp__purge_score_objects`;
DELIMITER $$
CREATE PROCEDURE `sp__purge_score_objects`()
BEGIN
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_id INT DEFAULT 0;
  DECLARE v_next_id INT DEFAULT 0;
  DECLARE v_sql TEXT;
  DECLARE v_blockers TEXT DEFAULT NULL;
  DECLARE v_msg VARCHAR(128);

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  SELECT GROUP_CONCAT(label SEPARATOR ', ')
    INTO v_blockers
    FROM (
      SELECT CONCAT(r.ROUTINE_TYPE, ' ', r.ROUTINE_NAME) AS label
        FROM information_schema.ROUTINES r
       WHERE r.ROUTINE_SCHEMA = DATABASE()
         AND r.ROUTINE_NAME <> 'sp__purge_score_objects'
         AND r.ROUTINE_DEFINITION LIKE '%dual\\_evaluaciones%'
      UNION ALL
      SELECT CONCAT('TRIGGER ', t.TRIGGER_NAME)
        FROM information_schema.TRIGGERS t
       WHERE t.TRIGGER_SCHEMA = DATABASE()
         AND t.EVENT_OBJECT_TABLE <> 'dual_evaluaciones'
         AND t.ACTION_STATEMENT LIKE '%dual\\_evaluaciones%'
      UNION ALL
      SELECT CONCAT('EVENT ', e.EVENT_NAME)
        FROM information_schema.EVENTS e
       WHERE e.EVENT_SCHEMA = DATABASE()
         AND e.EVENT_DEFINITION LIKE '%dual\\_evaluaciones%'
    ) blockers;

  IF v_blockers IS NOT NULL THEN
    SET v_msg = LEFT(CONCAT('Dependencia no eliminable: ', v_blockers), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_score_drop_stmts;
  CREATE TEMPORARY TABLE tmp_score_drop_stmts (
    id INT NOT NULL AUTO_INCREMENT,
    sort_order TINYINT NOT NULL,
    stmt TEXT NOT NULL,
    PRIMARY KEY (id)
  );

  INSERT INTO tmp_score_drop_stmts (sort_order, stmt)
  SELECT DISTINCT 1, CONCAT(
    'ALTER TABLE `', rc.CONSTRAINT_SCHEMA, '`.`', rc.TABLE_NAME,
    '` DROP FOREIGN KEY `', rc.CONSTRAINT_NAME, '`'
  )
  FROM information_schema.REFERENTIAL_CONSTRAINTS rc
  WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
    AND rc.REFERENCED_TABLE_NAME = 'dual_evaluaciones';

  INSERT INTO tmp_score_drop_stmts (sort_order, stmt)
  SELECT DISTINCT 2, CONCAT(
    'DROP VIEW IF EXISTS `', v.TABLE_SCHEMA, '`.`', v.TABLE_NAME, '`'
  )
  FROM information_schema.VIEWS v
  WHERE v.TABLE_SCHEMA = DATABASE()
    AND v.VIEW_DEFINITION LIKE '%dual\\_evaluaciones%';

  drop_loop: LOOP
    SET v_done = 0;
    SELECT id, stmt INTO v_next_id, v_sql
      FROM tmp_score_drop_stmts
     WHERE id > v_id
     ORDER BY sort_order, id
     LIMIT 1;

    IF v_done = 1 THEN
      LEAVE drop_loop;
    END IF;

    SET v_id = v_next_id;
    SET @purge_sql = v_sql;
    PREPARE purge_stmt FROM @purge_sql;
    EXECUTE purge_stmt;
    DEALLOCATE PREPARE purge_stmt;
  END LOOP;

  DROP TEMPORARY TABLE IF EXISTS tmp_score_drop_stmts;
  DROP TABLE IF EXISTS `dual_evaluaciones`;
END$$
DELIMITER ;

CALL `sp__purge_score_objects`();
DROP PROCEDURE IF EXISTS `sp__purge_score_objects`;
