import https from "https";
import { NextRequest, NextResponse } from "next/server";

type SubjectInfo = {
  name: string;
  examDate?: string | null;
  priorityScore?: number | null;
  studyRange?: string | null;
  myScore?: number | null;
  averageScore?: number | null;
  grade?: string | null;
  credits?: number | null;
  isMajor?: boolean | null;
};

function callGroqAPI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const buf = Buffer.from(body, "utf-8");
    const apiKey = (process.env.GROQ_API_KEY ?? "").trim();

    const req = https.request(
      {
        hostname: "api.groq.com",
        path: "/openai/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": buf.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          try {
            const data = Buffer.concat(chunks).toString("utf-8");
            const json = JSON.parse(data);
            resolve(json.choices[0].message.content ?? "");
          } catch (e) {
            reject(e);
          }
        });
      },
    );

    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    today: string;
    dailyHours: number;
    subject?: string;
    goal?: string;
    deadline?: string;
    readiness?: string;
    subjects?: SubjectInfo[];
    targetGpa?: number;
  };

  const { today, dailyHours } = body;
  let prompt: string;

  if (body.subjects && body.subjects.length > 0) {
    const subjectLines = body.subjects
      .map((s, i) => {
        const lines: string[] = [];
        const meta: string[] = [];
        if (s.isMajor != null) meta.push(s.isMajor ? "전공" : "교양");
        if (s.credits != null) meta.push(`${s.credits}학점`);
        lines.push(`${i + 1}. ${s.name}${meta.length ? ` (${meta.join(", ")})` : ""}`);

        const scoreParts: string[] = [];
        if (s.myScore != null) scoreParts.push(`내 점수: ${s.myScore}점`);
        if (s.averageScore != null) scoreParts.push(`평균: ${s.averageScore}점`);
        if (s.myScore != null && s.averageScore != null) {
          const gap = s.averageScore - s.myScore;
          if (gap > 10) scoreParts.push("→ 취약 과목 (우선 배치 필요)");
          else if (gap <= 0) scoreParts.push("→ 양호");
        }
        if (s.priorityScore != null) scoreParts.push(`우선순위: P${s.priorityScore.toFixed(1)}`);
        if (scoreParts.length) lines.push(`   ${scoreParts.join(", ")}`);

        if (s.studyRange?.trim()) {
          lines.push(`   시험 범위: ${s.studyRange.trim().slice(0, 120)}`);
        }
        if (s.examDate) lines.push(`   시험일: ${s.examDate}`);

        return lines.join("\n");
      })
      .join("\n");

    const targetLine = body.targetGpa ? `\n목표 GPA: ${body.targetGpa}` : "";

    prompt = `다음 과목들의 시험을 준비하는 학습 계획을 세워줘:

${subjectLines}

오늘: ${today}${targetLine}
하루 공부 가능 시간: ${dailyHours}시간 (= ${dailyHours * 60}분)

조건:
- 단순 반복 말고 날짜별로 구체적인 학습 내용을 다르게 구성해줘
- 취약 과목(점수 낮은 것)을 우선 배치해줘
- 시험 전날은 해당 과목 전체 복습으로 구성해줘
- 할 일은 구체적으로 작성해줘 (예: '3장 프로세스 스케줄링 개념 정리 + 예제 풀기', '112~130page 1독 후 키워드 메모')
- 하루에 같은 과목 2번 이상 넣지 말아줘
- 하루 총 학습 시간이 ${dailyHours * 60}분을 넘지 않게 해줘
- 범위 정보가 있으면 그 내용을 task에 반영해줘

오늘부터 가장 빠른 시험일까지 날짜별 계획을 다음 JSON 형식으로만 반환해:
{
  "plans": [
    { "date": "YYYY-MM-DD", "subject": "과목명", "task": "구체적인 할 일", "duration": 60 }
  ]
}
JSON 외에 다른 텍스트 없이.`;
  } else {
    const subjectLine = body.subject ? `\n- 과목: ${body.subject}` : "";
    const dueDateLine = body.deadline ? `\n- 마감일: ${body.deadline}` : "";
    const readinessLine = body.readiness ? `\n- 현재 준비 상태: ${body.readiness}` : "";
    const subjectName = body.subject ?? "과목";

    prompt = `다음 조건으로 공부 계획을 세워줘:
- 목표: ${body.goal}${subjectLine}
- 오늘 날짜: ${today}${dueDateLine}
- 하루 공부 가능 시간: ${dailyHours}시간${readinessLine}

오늘부터 마감일까지 날짜별 공부 계획을 JSON 형식으로 작성해줘:
{
  "plans": [
    { "date": "YYYY-MM-DD", "subject": "${subjectName}", "task": "공부할 내용", "duration": 60 }
  ]
}
JSON만 반환하고 다른 텍스트는 없이.`;
  }

  const text = await callGroqAPI(prompt);
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);

  if (!match) {
    return NextResponse.json({ error: "AI 응답 파싱 실패" }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(match[0]);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "AI 응답이 올바른 JSON이 아닙니다." }, { status: 500 });
  }
}
