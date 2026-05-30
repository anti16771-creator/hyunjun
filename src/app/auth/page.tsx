import Link from "next/link";

export default function AuthIndexPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 rounded-[2rem] bg-white p-10 shadow-sm dark:bg-slate-900">
      <div className="space-y-4">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">계정 관리</p>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">로그인, 회원가입, 아이디 찾기</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          이메일 인증 없이 즉시 가입 및 로그인되며, 가입된 이름으로 아이디를 찾거나 비밀번호 재설정도 가능합니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/auth/login" className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-base font-semibold text-slate-900 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
          로그인
        </Link>
        <Link href="/auth/signup" className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-base font-semibold text-slate-900 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
          회원가입
        </Link>
        <Link href="/auth/find-id" className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-base font-semibold text-slate-900 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
          아이디 찾기
        </Link>
        <Link href="/auth/forgot" className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-base font-semibold text-slate-900 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
          비밀번호 찾기
        </Link>
      </div>
    </div>
  );
}
