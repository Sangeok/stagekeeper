-- 상태 식별자를 한국어에서 영문으로 바꾼다 (docs/conventions/product-copy.md §3).
-- 스키마는 그대로(status는 String). 값만 옮긴다. validation 자유 텍스트는 손대지 않는다.
-- 6값 전부를 CASE 하나로 — 부분 적용 상태가 생기지 않게 한 문장씩 원자적으로.

UPDATE "BoardItem" SET "status" = CASE "status"
  WHEN '승인대기' THEN 'proposed'
  WHEN '계획지시' THEN 'planning'
  WHEN '검토대기' THEN 'in_review'
  WHEN '구현승인' THEN 'implementing'
  WHEN '완료'     THEN 'done'
  WHEN '보류'     THEN 'on_hold'
  ELSE "status" END
WHERE "status" IN ('승인대기', '계획지시', '검토대기', '구현승인', '완료', '보류');

UPDATE "TransitionEvent" SET "from" = CASE "from"
  WHEN '승인대기' THEN 'proposed'
  WHEN '계획지시' THEN 'planning'
  WHEN '검토대기' THEN 'in_review'
  WHEN '구현승인' THEN 'implementing'
  WHEN '완료'     THEN 'done'
  WHEN '보류'     THEN 'on_hold'
  ELSE "from" END
WHERE "from" IN ('승인대기', '계획지시', '검토대기', '구현승인', '완료', '보류');

UPDATE "TransitionEvent" SET "to" = CASE "to"
  WHEN '승인대기' THEN 'proposed'
  WHEN '계획지시' THEN 'planning'
  WHEN '검토대기' THEN 'in_review'
  WHEN '구현승인' THEN 'implementing'
  WHEN '완료'     THEN 'done'
  WHEN '보류'     THEN 'on_hold'
  ELSE "to" END
WHERE "to" IN ('승인대기', '계획지시', '검토대기', '구현승인', '완료', '보류');
