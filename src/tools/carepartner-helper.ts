import { server } from "../index.js";
import { z } from "zod";
import fetch from "node-fetch";
import dotenv from "dotenv";

// 환경 변수 로드
dotenv.config();

const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const TIMEOUT_MS = 25000; // 25초 타임아웃 설정

// 타임아웃을 포함한 fetch 래퍼 함수
async function fetchWithTimeout(url: string, options: any, timeout: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`요청 시간이 초과되었습니다. (${timeout}ms)`);
    }
    throw error;
  }
}

// 케어파트너 일자리 검색 도구
export function registerSearchCareJobsTool() {
  // OpenRouter API 키 확인
  if (!openRouterApiKey) {
    console.warn(
      "OPENROUTER_API_KEY가 .env 파일에 없습니다. 'search_care_jobs' 도구가 등록되지 않습니다."
    );
    return;
  }

  server.tool(
    "search_care_jobs",
    "한국의 케어파트너라는 서비스에서 특정 지역의 요양 일자리를 검색합니다.",
    {
      location: z.string().describe("검색할 지역 주소"),
    },
    async (args) => {
      const { location } = args;
      const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";

      const headers = {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
      };

      const body = JSON.stringify({
        model: "perplexity/sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "You are an expert in searching and analyzing care job information in Korea. Find care partner job listings near the given address in 'https://carepartner.kr' and provide them in a structured format. Each job listing must follow this format:\n\n" +
              "1. Job Title\n" +
              "2. Work Location\n" +
              "3. Working Hours\n" +
              "4. Salary Conditions\n" +
              "5. Job URL in 'https://carepartner.kr' (must be included)\n\n" +
              "If URL is not available, display 'URL not available'. Keep the response simple and clear.",
          },
          {
            role: "user",
            content: `Find 3 care partner job listings near "${location}" in 'https://carepartner.kr'. Provide the following information for each job listing: 1) Job Title 2) Work Location 3) Working Hours 4) Salary Conditions 5) Job URL`,
          },
        ],
        max_tokens: 500, // 토큰 수 제한
        temperature: 0.7, // 응답의 다양성 조절
      });

      try {
        const response = await fetchWithTimeout(
          openRouterUrl,
          {
            method: "POST",
            headers: headers,
            body: body,
          },
          TIMEOUT_MS
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `OpenRouter API 요청 실패: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data: any = await response.json();
        const assistantMessage = data.choices?.[0]?.message?.content;

        if (!assistantMessage) {
          console.error("OpenRouter 응답 구조 오류:", data);
          throw new Error("OpenRouter 응답에서 메시지를 추출할 수 없습니다.");
        }

        return {
          content: [
            {
              type: "text",
              text: assistantMessage,
            },
          ],
        };
      } catch (error: unknown) {
        console.error("일자리 검색 중 오류 발생:", error);
        return {
          content: [
            {
              type: "text",
              text: `죄송합니다. 일자리 검색 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.\n오류: ${
                error instanceof Error ? error.message : "알 수 없는 오류"
              }`,
            },
          ],
        };
      }
    }
  );
}
