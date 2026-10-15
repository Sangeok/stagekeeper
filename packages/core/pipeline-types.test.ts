import { composedReason, expand, recompose, validateDefinition, type DefinitionInput, type Definitions, type NodeFacts } from './pipeline.mjs';
const fragment = { steps: ['plan'], gates: [] } as const satisfies DefinitionInput;
const definitions = { one: fragment } as const satisfies Definitions;
const expanded = expand('one', definitions, [] as const);
if (expanded.ok) composedReason(expanded.graph); else expanded.reason satisfies string;
const result = recompose('one', definitions, [] as const, 'pro');
if (result.ok) result.runnable.one satisfies { nodes: string[]; gates: string[] } | null;
else result.pipelineId satisfies string;
const input: unknown = {};
validateDefinition(input, 'pro');

// compile-only: 실제 호출부와 같은 공개 선언을 검사한다. Node 런타임 테스트가 아니다.
type Assert<T extends true> = T;
type Accepts<T> = T extends NodeFacts["validation"] ? true : false;

export type ValidationContract = [
  Assert<Accepts<string>>,
  Assert<Accepts<null>>,
  Assert<Accepts<undefined> extends false ? true : false>,
  Assert<Accepts<number> extends false ? true : false>,
  Assert<Accepts<boolean> extends false ? true : false>,
  Assert<Accepts<object> extends false ? true : false>,
];
