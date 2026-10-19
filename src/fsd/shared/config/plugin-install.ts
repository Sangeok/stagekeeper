// 설치 순서는 marketplace 등록 → plugin 설치다. 토큰 화면과 공개 문서가 같은 명령을 보여 준다.
export const PLUGIN_MARKETPLACE = "Sangeok/stagekeeper";
export const PLUGIN_ID = "harness@stagekeeper-local";

export const installCommands: readonly string[] = [
  `claude plugin marketplace add ${PLUGIN_MARKETPLACE}`,
  `claude plugin install ${PLUGIN_ID}`,
];
