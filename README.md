# scamdev

download: <https://github.com/dragsbruh/scamdev/releases/latest/download/domains.json.gz>

## format

> fields marked with `?` at end of name are optional (might not exist).
> one of `data` or `error` will be present

```json
{
  "example.is-a.dev": {
    "domain": "example.is-a.dev",
    "time":"2026-03-09T12:40:37.962Z",
    
    "data?": {
      "status": 200,
      "url": "https://final-resolved-url",
      
      "lang?": "en",
      "canonical?": "https://meta-canonical-tag",
      
      "title?": "page <title> tag",
      "body?": "cleaned page content",
      
      "favicon?": "https://resolved-favicon-url",
      "themeColor?": "#theme-color-hex",
      
      "opengraph": {
        "url?": "https://opengraph-url",
        "image?": "https://opengraph-image",
        "siteName?": "opengraph site name",
        "description?": "opengraph description"
      },
      
      "error?": "error reason"
    },
  },
}
```
