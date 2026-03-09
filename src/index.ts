import { parse as parseHTML } from "node-html-parser";

const concurrency = 20;
const timeout = 7500;

const outputFile = "domains.json";

const tempDir = "temp";
const tempFile = (domain: string) => `${tempDir}/${domain}.json`;

const isTest = Bun.argv.at(-1) === "--test";
const testDomains = [
  "furina.is-a.dev",
  "hearth.is-a.dev",
  "iostpa.is-a.dev",
  "colon.3.is-a.dev",
  "3.is-a.dev",
  "c.is-a.dev",
];

type ScrapeData = {
  url: string;
  status: number;

  lang?: string;
  canonical?: string;

  title?: string;
  body?: string;

  favicon?: string;
  themeColor?: string;

  opengraph: {
    url?: string;
    image?: string;
    siteName?: string;
    description?: string;
  };
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
    let result: ScrapeResponse = {
      domain: domain,
      time: new Date(),
    };

    fetch(`http://${domain}`, { signal: AbortSignal.timeout(timeout) })
      .then(async (response) => {
        const text = await response.text();
        const document = parseHTML(text);

        const selectText = (query: string) =>
          document
            .querySelector(query)
            ?.textContent.replace(/\s+/g, " ")
            .trim();

        const joinSelectText = (query: string, remove?: string) => {
          if (remove)
            document.querySelectorAll(remove).forEach((e) => e.remove());
          return document
            .querySelectorAll(query)
            .map((e) => e.textContent)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        };

        const anySelectAttr = (attr: string, queries: string[]) => {
          for (const query of queries) {
            const elem = document.querySelector(query);
            if (elem) return elem.getAttribute(attr)?.trim();
          }
        };

        const resolveUrl = (url?: string) =>
          url ? new URL(url, response.url).href : undefined;

        const title = selectText("title");

        const body = joinSelectText(
          "p, h1, h2, h3, h4, h5, h6, li, blockquote",
          "nav, script, style, noscript",
        );

        const favicon = anySelectAttr("href", [
          'link[rel="icon"]',
          'link[rel="shortcut icon"]',
          'link[rel="apple-touch-icon"]',
        ]);

        const themeColor = anySelectAttr("content", [
          'meta[name="theme-color"]',
        ]);

        const canonical = anySelectAttr("href", ['link[rel="canonical"]']);

        const ogDescription = anySelectAttr("content", [
          'meta[property="og:description"]',
          'meta[name="twitter:description"]',
        ]);

        const ogImage = anySelectAttr("content", [
          'meta[property="og:image"]',
          'meta[name="twitter:image"]',
        ]);

        const ogUrl = anySelectAttr("content", [
          'meta[property="og:url"]',
          'meta[name="twitter:url"]',
        ]);

        const ogSiteName = anySelectAttr("content", [
          'meta[property="og:site_name"]',
        ]);

        const lang = anySelectAttr("lang", ["html"]);

        result.data = {
          status: response.status,
          url: response.url,

          lang: lang,
          canonical: resolveUrl(canonical),

          themeColor: themeColor,
          favicon: resolveUrl(favicon),

          title: title,
          body: body,

          opengraph: {
            url: resolveUrl(ogUrl),
            image: resolveUrl(ogImage),

            siteName: ogSiteName,
            description: ogDescription,
          },
        };
      })
      .catch((err) => {
        result.error = err instanceof Error ? err.message : (err as string);
      })
      .finally(() => resolve(result));
  });
};

const saveResults = async (paths: string[]) => {
  const outfile = Bun.file(outputFile);

  try {
    await outfile.delete();
  } catch (err) {}

  const writer = outfile.writer();

  await writer.write("{");

  for (let i = 0; i < paths.length; i++) {
    if (i > 0) await writer.write(",");

    const filepath = paths[i]!;

    const domain = filepath.split("/").at(-1)!.slice(0, -5); // remove .json
    await writer.write(`\"${domain}\":`);

    const infile = Bun.file(filepath);
    await writer.write(await infile.arrayBuffer());
  }

  await writer.write("}");
  await writer.end();

  await Bun.$`gzip -f ${outfile}`;
};

const writeResult = async (result: ScrapeResponse) => {
  await Bun.file(tempFile(result.domain)).write(JSON.stringify(result));

  console.log(
    queue.length,
    failed.length,
    result.domain,
    result.data?.status,
    result.data?.title,
  );
};

const domains = isTest ? testDomains : await getDomains();
const filenames = domains.map((f) => tempFile(f));

const queue = domains;
const failed: string[] = [];

const worker = async () => {
  while (true) {
    const domain = queue.pop();
    if (!domain) break;

    const result = await process(domain);
    await writeResult(result);

    if (result.error) {
      failed.push(result.domain);
    }
  }

  while (true) {
    const domain = failed.pop();
    if (!domain) break;

    const result = await process(domain);
    await writeResult(result);
  }
};

const workers = Array.from({ length: concurrency }).map(() => worker());
await Promise.all(workers);
await saveResults(filenames);
