import https from "https";
import { NextRequest } from "next/server";

function callGroqAPIStream(
  prompt: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      stream: true,
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
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += Buffer.from(chunk).toString("utf-8");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices[0]?.delta?.content ?? "";
              if (text) controller.enqueue(encoder.encode(text));
            } catch {}
          }
        });
        res.on("end", resolve);
      },
    );

    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  const { title, subject, dueDate, memo } = (await request.json()) as {
    title: string;
    subject?: string;
    dueDate?: string;
    memo?: string;
  };

  const subjectLine = subject ? `\n과목: ${subject}` : "";
  const dueDateLine = dueDate ? `\n마감: ${dueDate}` : "";
  const memoLine = memo ? `\n추가 정보: ${memo}` : "";

  const prompt = `다음 과제를 도와줘:
과제명: ${title}${subjectLine}${dueDateLine}${memoLine}

아래 항목을 한국어로 간결하게 답해줘:

## 단계별 접근 방법
이 과제를 어떻게 시작하고 단계별로 진행할지 구체적으로 설명해줘.

## 참고할 핵심 개념/키워드
이 과제에서 반드시 이해해야 할 중요한 개념이나 키워드를 정리해줘.

## 예상 소요 시간
이 과제를 완성하는 데 필요한 대략적인 시간과 시간 배분 방법을 알려줘.

## 주의사항 또는 팁
자주 하는 실수, 함정, 그리고 효과적인 학습 팁을 공유해줘.

친근하고 격려하는 톤으로, 학생이 실제로 도움이 될 수 있도록 구체적으로 작성해줘.`;

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        await callGroqAPIStream(prompt, controller, encoder);
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
