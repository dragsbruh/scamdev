import { Mutex } from "async-mutex";
import { parse as parseHTML } from "node-html-parser";

const concurrency = 20;
const timeout = 5000;
const saveFile = Bun.file("domains.json");

type ScrapeResponse = {
  domain: string;
  status: number;
  title?: string;
  error?: string;
  time: Date;
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

    fetch(`http://${domain}`, { signal: controller.signal })
      .then((response) => {
        response.text().then((text) => {
          const title = parseHTML(text).querySelector("title");
          resolve({
            domain: domain,
            time: new Date(),
            title: title?.textContent,
            status: response.status,
          });
        });
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : (err as string);
        resolve({
          domain: domain,
          time: new Date(),
          error: errMsg,
          status: 69420,
        });
      })
      .finally(() => clearTimeout(timeoutId));
  });
};

const saveResults = async (mutex: Mutex, results: ScrapeResponse[]) => {
  const release = await mutex.acquire();
  await saveFile.write(JSON.stringify(results));
  release();
};

const loadResults = (mutex: Mutex): Promise<ScrapeResponse[]> => {
  return new Promise((resolve) =>
    mutex.acquire().then((release) => {
      saveFile
        .json()
        .then((d) => resolve(d))
        .catch(() => resolve([]))
        .finally(() => release());
    }),
  );
};

const resultsMu = new Mutex();
const queue = await getDomains();

const results = await loadResults(resultsMu);

const worker = async () => {
  while (true) {
    const domain = queue.pop();
    if (!domain) return;

    const data = await process(domain);
    results.push(data);

    console.log(domain, data.status, data.title);
    saveResults(resultsMu, results); // intentional
  }
};

const workers = Array.from({ length: concurrency }).map(() => worker());
await Promise.all(workers);
await saveResults(resultsMu, results);
