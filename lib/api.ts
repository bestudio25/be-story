import { NextResponse } from "next/server";
import { HttpError } from "./auth";

/** Envolve um handler de API com tratamento de erro em português. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Erro inesperado. Tente novamente." }, { status: 500 });
    }
  };
}
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
