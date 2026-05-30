type LoadingCardProps = {
  message?: string;
};

export default function LoadingCard({ message = "데이터를 로딩 중입니다..." }: LoadingCardProps) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
      {message}
    </div>
  );
}
