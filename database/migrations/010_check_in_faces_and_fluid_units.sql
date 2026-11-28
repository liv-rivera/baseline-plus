-- Check-in faces and fluid units.
-- 1. A new field type, "faces": four steps shown as 😞 😐 🙂 😃, stored as 1 to 4 in
--    check_in_answers.score, with one description per face in score_labels.
-- 2. A per-account fluid unit, litres or US fluid ounces. Fluid answers are stored in the
--    field's own unit, and switching converts the saved answers so history keeps its meaning.
-- 3. The POTS starter set's Salt field becomes a faces field where it has no answers yet.
BEGIN;

ALTER TABLE check_in_fields DROP CONSTRAINT check_in_fields_kind_check;
ALTER TABLE check_in_fields ADD CONSTRAINT check_in_fields_kind_check
  CHECK (kind IN ('score', 'faces', 'yes_no', 'number', 'notes'));

ALTER TABLE check_in_fields DROP CONSTRAINT check_in_fields_check;
ALTER TABLE check_in_fields ADD CONSTRAINT check_in_fields_score_labels_check CHECK (
  (kind = 'score' AND cardinality(score_labels) = 5)
  OR (kind = 'faces' AND cardinality(score_labels) = 4)
  OR (kind NOT IN ('score', 'faces') AND score_labels IS NULL)
);

ALTER TABLE check_in_settings
  ADD COLUMN fluid_unit text NOT NULL DEFAULT 'L' CHECK (fluid_unit IN ('L', 'oz'));

-- Faces answers are 1 to 4. Checked against the field's type when saving (the score column
-- itself still allows 1 to 5 for score fields).

UPDATE check_in_fields f
   SET kind = 'faces',
       unit = NULL,
       score_labels = ARRAY['About 10 mg to 1 g', 'About 1 to 3 g', 'About 3 to 6 g', 'About 6 to 10 g']
 WHERE f.preset = 'pots' AND f.label = 'Salt' AND f.kind = 'number'
   AND NOT EXISTS (SELECT 1 FROM check_in_answers a WHERE a.field_id = f.id);

COMMIT;
