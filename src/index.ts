import { gzipSync } from "bun";
import { parse as parseHTML } from "node-html-parser";

const concurrency = 25;
const timeout = 7500;
const outputFile = Bun.file("domains.json.gz");

type ScrapeData = {
  status: number;
  url: string;
  title?: string;
  body?: string;
};

type ScrapeResponse = {
  domain: string;
  time: Date;
  data?: ScrapeData;
  error?: string;
};

const getDomains = async () => {
  const response = await fetch("https://raw.is-a.dev/v2.json");
  const rawData = (await response.json()) as { domain: string }[];
  return rawData.map((d) => d.domain).filter((d) => !d.includes("_"));
};

const process = (domain: string): Promise<ScrapeResponse> => {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let result: ScrapeResponse = {
      domain: domain,
      time: new Date(),
    };

    fetch(`http://${domain}`, { signal: controller.signal })
      .then(async (response) => {
        const text = await response.text();
        const document = parseHTML(text);

        const title = document.querySelector("title");
        const body = document.querySelector("body");

        result.data = {
          status: response.status,
          url: response.url,
          title: title?.textContent,
          body: body?.textContent,
        };
      })
      .catch((err) => {
        result.error = err instanceof Error ? err.message : (err as string);
      })
      .finally(() => {
        resolve(result);
        clearTimeout(timeoutId);
      });
  });
};

const saveResults = async (results: Map<string, ScrapeResponse>) => {
  const encoded = JSON.stringify(Object.fromEntries(results));
  const compressed = gzipSync(encoded, { level: 6 });
  await outputFile.write(compressed);
};

const queue = await getDomains();
const results = new Map<string, ScrapeResponse>();

const worker = async () => {
  while (true) {
    const domain = queue.pop();
    if (!domain) return;

    const result = await process(domain);
    results.set(result.domain, result);

    console.log(
      queue.length,
      result.domain,
      result.data?.status,
      result.data?.title,
    );
  }
};

const workers = Array.from({ length: concurrency }).map(() => worker());
await Promise.all(workers);
await saveResults(results);
