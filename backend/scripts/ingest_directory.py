from __future__ import annotations

import argparse
import os
from pathlib import Path

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload a directory of authority PDFs into BuildWise AI.")
    parser.add_argument("directory", type=Path)
    parser.add_argument("--api", default=os.getenv("API_BASE_URL", "http://localhost:8000"))
    parser.add_argument("--admin-key", default=os.getenv("ADMIN_API_KEY"))
    parser.add_argument("--authority-id", required=True)
    parser.add_argument("--city", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--document-type", default="bylaws")
    parser.add_argument("--official-url", default="")
    parser.add_argument("--issuing-department", default="")
    args = parser.parse_args()

    if not args.admin_key:
        raise SystemExit("ADMIN_API_KEY is required.")
    if not args.directory.exists():
        raise SystemExit(f"Directory not found: {args.directory}")

    pdfs = sorted(args.directory.glob("*.pdf"))
    if not pdfs:
        raise SystemExit("No PDFs found.")

    with httpx.Client(timeout=120) as client:
        for pdf in pdfs:
            with pdf.open("rb") as handle:
                response = client.post(
                    f"{args.api.rstrip('/')}/ingest",
                    headers={"X-Admin-Api-Key": args.admin_key},
                    data={
                        "authority_id": args.authority_id,
                        "title": pdf.stem.replace("_", " ").replace("-", " ").title(),
                        "document_type": args.document_type,
                        "city": args.city,
                        "state": args.state,
                        "country": "India",
                        "issuing_department": args.issuing_department,
                        "official_url": args.official_url,
                        "tags": "batch-upload,official-pdf",
                    },
                    files={"file": (pdf.name, handle, "application/pdf")},
                )
            response.raise_for_status()
            data = response.json()
            print(f"Indexed {pdf.name}: {data['chunks_indexed']} chunks")


if __name__ == "__main__":
    main()
