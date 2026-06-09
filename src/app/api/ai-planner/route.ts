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
        const parts: string[] = [`${i + 1}. ${s.name}`];
        if (s.examDate) parts.push(`시험일: ${s.examDate}`);
        if (s.priorityScore != null) parts.push(`우선순위: P${s.priorityScore.toFixed(1)}`);
        if (s.myScore != null) parts.push(`내 점수: ${s.myScore}점`);
        if (s.averageScore != null) parts.push(`평균: ${s.averageScore}점`);
        if (s.grade && s.grade !== "—") parts.push(`예상 등급: ${s.grade}`);
        if (s.studyRange) parts.push(`범위: ${s.studyRange.slice(0, 50)}`);
        return parts.join(", ");
      })
      .join("\n");

    const targetLine = body.targetGpa ? `\n- 목표 GPA: ${body.targetGpa}` : "";

    prompt = `다음 조건으로 공부 계획을 세워줘:
- 오늘 날짜: ${today}
- 하루 공부 가능 시간: ${dailyHours}시간${targetLine}

현재 과목별 시험 정보:
${subjectLines}

오늘부터 가장 가까운 시험일까지 날짜별 공부 계획을 JSON 형식으로 작성해줘.
- 우선순위 점수가 높은 과목 위주로 배치해줘
- 시험일이 가까울수록 해당 과목 비중을 높여줘
- 내 점수가 평균보다 낮은 취약 과목에 시간을 더 배분해줘
- 하루 총 공부 시간이 ${dailyHours}시간을 넘지 않게 해줘
- task 필드에 "과목명: 공부 내용" 형식으로 작성해줘

{
  "plans": [
    { "date": "YYYY-MM-DD", "task": "과목명: 공부할 내용", "duration": 60 },
    ...
  ]
}
JSON만 반환하고 다른 텍스트는 없이.`;
  } else {
    const subjectLine = body.subject ? `\n- 과목: ${body.subject}` : "";
    const dueDateLine = body.deadline ? `\n- 마감일: ${body.deadline}` : "";
    const readinessLine = body.readiness ? `\n- 현재 준비 상태: ${body.readiness}` : "";

    prompt = `다음 조건으로 공부 계획을 세워줘:
- 목표: ${body.goal}${subjectLine}
- 오늘 날짜: ${today}${dueDateLine}
- 하루 공부 가능 시간: ${dailyHours}시간${readinessLine}

오늘부터 마감일까지 날짜별 공부 계획을 JSON 형식으로 작성해줘:
{
  "plans": [
    { "date": "YYYY-MM-DD", "task": "공부할 내용", "duration": 60 },
    ...
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
