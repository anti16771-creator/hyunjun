import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { title, subject, dueDate, memo } = (await request.json()) as {
    title: string;
    subject?: string;
    dueDate?: string;
    memo?: string;
  };

  const subjectLine = subject ? `\n과목: ${subject}` : "";
  const dueDateLine = dueDate ? `\n마감일: ${dueDate}` : "";
  const memoLine = memo ? `\n메모/추가 정보: ${memo}` : "";

  const prompt = `당신은 한국 학생의 과제를 도와주는 친절한 AI 튜터입니다. 아래 과제 정보를 바탕으로 구체적이고 실용적인 학습 도움말을 제공해주세요.

과제명: ${title}${subjectLine}${dueDateLine}${memoLine}

다음 네 가지 항목을 포함하여 도움말을 작성해주세요:

## 접근 방법
이 과제를 어떻게 시작하고 단계별로 진행할지 구체적으로 설명해주세요.

## 핵심 개념
이 과제에서 반드시 이해해야 할 중요한 개념이나 이론을 간결하게 정리해주세요.

## 예상 소요 시간
이 과제를 완성하는 데 필요한 대략적인 시간과 시간 배분 방법을 알려주세요.

## 주의사항 & 팁
자주 하는 실수, 함정, 그리고 효과적인 학습 팁을 공유해주세요.

친근하고 격려하는 톤으로, 학생이 실제로 도움이 될 수 있도록 구체적으로 작성해주세요.`;

  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      stream: true,
    }),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const reader = groqResponse.body!.getReader();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
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
        }
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
