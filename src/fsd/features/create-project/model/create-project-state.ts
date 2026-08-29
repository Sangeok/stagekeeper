// 액션의 반환 형. Client Component가 *.server를 import할 수 없어서 model에 둔다(fsd.md 「Server와 Client 경계」).
export type CreateProjectState = { error?: string; slug?: string; token?: string };
