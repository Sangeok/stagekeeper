// 수와 명사 한 묶음. 화면 문장이 `{n} open agent runs`처럼 복수형을 고정해 두면 1개일 때 틀린다.
export function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
