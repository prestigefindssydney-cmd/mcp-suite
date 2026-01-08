#!/usr/bin/env python3
"""
MCP Server pour Vertex AI RAG API
Permet de creer des corpus, indexer des documents et effectuer des requetes RAG
"""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# Configuration Google Cloud
PROJECT_ID = os.getenv("GOOGLE_PROJECT_ID")
LOCATION = os.getenv("GOOGLE_LOCATION", "us-central1")

# Import conditionnel de Vertex AI
try:
    from google.cloud import aiplatform
    from vertexai.preview import rag
    from vertexai.preview.generative_models import GenerativeModel, Tool as VertexTool
    import vertexai
    VERTEX_AVAILABLE = True
except ImportError:
    VERTEX_AVAILABLE = False

server = Server("vertex-rag")

# Cache des corpus pour eviter les appels API repetitifs
corpus_cache = {}


def init_vertex():
    """Initialise Vertex AI avec le projet et la region"""
    if not VERTEX_AVAILABLE:
        raise RuntimeError("google-cloud-aiplatform non installe. Executer: pip install google-cloud-aiplatform")

    if not PROJECT_ID:
        raise RuntimeError("GOOGLE_PROJECT_ID non defini dans .env")

    vertexai.init(project=PROJECT_ID, location=LOCATION)


def get_corpus_by_name(display_name: str) -> Optional[Any]:
    """Recupere un corpus par son nom d'affichage"""
    try:
        corpora = rag.list_corpora()
        for corpus in corpora:
            if corpus.display_name == display_name:
                return corpus
        return None
    except Exception as e:
        return None


@server.list_tools()
async def list_tools() -> list[Tool]:
    """Liste les outils disponibles"""
    return [
        Tool(
            name="rag_create_corpus",
            description="Cree un nouveau corpus RAG pour stocker des documents. Un corpus = un projet/domaine.",
            inputSchema={
                "type": "object",
                "properties": {
                    "display_name": {
                        "type": "string",
                        "description": "Nom du corpus (ex: 'artisaas-interventions', 'bizdev-calls')"
                    },
                    "description": {
                        "type": "string",
                        "description": "Description du corpus"
                    }
                },
                "required": ["display_name"]
            }
        ),
        Tool(
            name="rag_list_corpora",
            description="Liste tous les corpus RAG existants",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="rag_delete_corpus",
            description="Supprime un corpus RAG",
            inputSchema={
                "type": "object",
                "properties": {
                    "corpus_name": {
                        "type": "string",
                        "description": "Nom complet du corpus (format: projects/.../locations/.../ragCorpora/...)"
                    }
                },
                "required": ["corpus_name"]
            }
        ),
        Tool(
            name="rag_import_documents",
            description="Importe des documents texte dans un corpus. Supporte JSON, texte brut, ou liste de documents.",
            inputSchema={
                "type": "object",
                "properties": {
                    "corpus_name": {
                        "type": "string",
                        "description": "Nom du corpus cible"
                    },
                    "documents": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string", "description": "ID unique du document"},
                                "content": {"type": "string", "description": "Contenu texte du document"},
                                "metadata": {"type": "object", "description": "Metadonnees optionnelles"}
                            },
                            "required": ["id", "content"]
                        },
                        "description": "Liste des documents a importer"
                    },
                    "chunk_size": {
                        "type": "integer",
                        "description": "Taille des chunks en tokens (defaut: 512)",
                        "default": 512
                    },
                    "chunk_overlap": {
                        "type": "integer",
                        "description": "Chevauchement entre chunks (defaut: 100)",
                        "default": 100
                    }
                },
                "required": ["corpus_name", "documents"]
            }
        ),
        Tool(
            name="rag_import_from_gcs",
            description="Importe des documents depuis Google Cloud Storage",
            inputSchema={
                "type": "object",
                "properties": {
                    "corpus_name": {
                        "type": "string",
                        "description": "Nom du corpus cible"
                    },
                    "gcs_uri": {
                        "type": "string",
                        "description": "URI GCS (ex: gs://bucket/folder/)"
                    }
                },
                "required": ["corpus_name", "gcs_uri"]
            }
        ),
        Tool(
            name="rag_query",
            description="Effectue une recherche semantique dans un corpus",
            inputSchema={
                "type": "object",
                "properties": {
                    "corpus_name": {
                        "type": "string",
                        "description": "Nom du corpus a interroger"
                    },
                    "query": {
                        "type": "string",
                        "description": "Question ou requete de recherche"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Nombre de resultats a retourner (defaut: 5)",
                        "default": 5
                    },
                    "similarity_threshold": {
                        "type": "number",
                        "description": "Seuil de similarite minimum (0-1, defaut: 0.7)",
                        "default": 0.7
                    }
                },
                "required": ["corpus_name", "query"]
            }
        ),
        Tool(
            name="rag_generate",
            description="Genere une reponse basee sur le contexte RAG (retrieval + generation)",
            inputSchema={
                "type": "object",
                "properties": {
                    "corpus_name": {
                        "type": "string",
                        "description": "Nom du corpus a utiliser"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "Question ou instruction pour la generation"
                    },
                    "model": {
                        "type": "string",
                        "description": "Modele Gemini a utiliser (defaut: gemini-1.5-flash)",
                        "default": "gemini-1.5-flash"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Nombre de documents contextuels (defaut: 5)",
                        "default": 5
                    },
                    "temperature": {
                        "type": "number",
                        "description": "Temperature de generation (0-1, defaut: 0.2)",
                        "default": 0.2
                    }
                },
                "required": ["corpus_name", "prompt"]
            }
        ),
        Tool(
            name="rag_list_files",
            description="Liste les fichiers indexes dans un corpus",
            inputSchema={
                "type": "object",
                "properties": {
                    "corpus_name": {
                        "type": "string",
                        "description": "Nom du corpus"
                    }
                },
                "required": ["corpus_name"]
            }
        ),
        Tool(
            name="rag_get_corpus_stats",
            description="Recupere les statistiques d'un corpus (nombre de documents, taille, etc.)",
            inputSchema={
                "type": "object",
                "properties": {
                    "corpus_name": {
                        "type": "string",
                        "description": "Nom du corpus"
                    }
                },
                "required": ["corpus_name"]
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Execute un outil RAG"""

    try:
        init_vertex()
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)}, ensure_ascii=False)
        )]

    if name == "rag_create_corpus":
        display_name = arguments["display_name"]
        description = arguments.get("description", f"Corpus cree le {datetime.now().isoformat()}")

        try:
            # Verifier si le corpus existe deja
            existing = get_corpus_by_name(display_name)
            if existing:
                return [TextContent(
                    type="text",
                    text=json.dumps({
                        "status": "exists",
                        "message": f"Corpus '{display_name}' existe deja",
                        "corpus_name": existing.name
                    }, ensure_ascii=False)
                )]

            # Creer le corpus
            corpus = rag.create_corpus(
                display_name=display_name,
                description=description
            )

            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "message": f"Corpus '{display_name}' cree",
                    "corpus_name": corpus.name,
                    "display_name": corpus.display_name
                }, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    elif name == "rag_list_corpora":
        try:
            corpora = rag.list_corpora()
            corpus_list = []
            for c in corpora:
                corpus_list.append({
                    "name": c.name,
                    "display_name": c.display_name,
                    "description": getattr(c, 'description', ''),
                    "create_time": str(getattr(c, 'create_time', ''))
                })

            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "count": len(corpus_list),
                    "corpora": corpus_list
                }, indent=2, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    elif name == "rag_delete_corpus":
        corpus_name = arguments["corpus_name"]

        try:
            rag.delete_corpus(name=corpus_name)
            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "message": f"Corpus supprime: {corpus_name}"
                }, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    elif name == "rag_import_documents":
        corpus_name = arguments["corpus_name"]
        documents = arguments["documents"]
        chunk_size = arguments.get("chunk_size", 512)
        chunk_overlap = arguments.get("chunk_overlap", 100)

        try:
            # Creer un fichier temporaire avec les documents
            import tempfile
            import shutil

            temp_dir = Path(tempfile.mkdtemp())
            imported_count = 0

            for doc in documents:
                doc_path = temp_dir / f"{doc['id']}.txt"
                content = doc['content']

                # Ajouter les metadonnees en header si presentes
                if 'metadata' in doc and doc['metadata']:
                    metadata_str = json.dumps(doc['metadata'], ensure_ascii=False)
                    content = f"[METADATA: {metadata_str}]\n\n{content}"

                doc_path.write_text(content, encoding='utf-8')
                imported_count += 1

            # Importer dans le corpus
            rag.import_files(
                corpus_name=corpus_name,
                paths=[str(temp_dir)],
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap
            )

            # Nettoyer
            shutil.rmtree(temp_dir)

            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "message": f"{imported_count} documents importes dans {corpus_name}",
                    "chunk_size": chunk_size,
                    "chunk_overlap": chunk_overlap
                }, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    elif name == "rag_import_from_gcs":
        corpus_name = arguments["corpus_name"]
        gcs_uri = arguments["gcs_uri"]

        try:
            rag.import_files(
                corpus_name=corpus_name,
                paths=[gcs_uri]
            )

            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "message": f"Import depuis {gcs_uri} lance"
                }, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    elif name == "rag_query":
        corpus_name = arguments["corpus_name"]
        query = arguments["query"]
        top_k = arguments.get("top_k", 5)
        similarity_threshold = arguments.get("similarity_threshold", 0.7)

        try:
            response = rag.retrieval_query(
                rag_resources=[
                    rag.RagResource(
                        rag_corpus=corpus_name
                    )
                ],
                text=query,
                similarity_top_k=top_k,
                vector_distance_threshold=1 - similarity_threshold  # Convertir similarite en distance
            )

            results = []
            for context in response.contexts.contexts:
                results.append({
                    "text": context.text,
                    "source": getattr(context, 'source_uri', 'unknown'),
                    "score": getattr(context, 'score', 0)
                })

            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "query": query,
                    "results_count": len(results),
                    "results": results
                }, indent=2, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    elif name == "rag_generate":
        corpus_name = arguments["corpus_name"]
        prompt = arguments["prompt"]
        model_name = arguments.get("model", "gemini-1.5-flash")
        top_k = arguments.get("top_k", 5)
        temperature = arguments.get("temperature", 0.2)

        try:
            # Configurer le RAG retrieval
            rag_retrieval_tool = VertexTool.from_retrieval(
                retrieval=rag.Retrieval(
                    source=rag.VertexRagStore(
                        rag_resources=[
                            rag.RagResource(rag_corpus=corpus_name)
                        ],
                        similarity_top_k=top_k
                    )
                )
            )

            # Creer le modele avec RAG
            model = GenerativeModel(
                model_name=model_name,
                tools=[rag_retrieval_tool]
            )

            # Generer la reponse
            response = model.generate_content(
                prompt,
                generation_config={
                    "temperature": temperature,
                    "max_output_tokens": 2048
                }
            )

            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "prompt": prompt,
                    "response": response.text,
                    "model": model_name
                }, indent=2, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    elif name == "rag_list_files":
        corpus_name = arguments["corpus_name"]

        try:
            files = rag.list_files(corpus_name=corpus_name)
            file_list = []
            for f in files:
                file_list.append({
                    "name": f.name,
                    "display_name": getattr(f, 'display_name', ''),
                    "size_bytes": getattr(f, 'size_bytes', 0),
                    "state": str(getattr(f, 'state', 'unknown'))
                })

            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "corpus": corpus_name,
                    "file_count": len(file_list),
                    "files": file_list
                }, indent=2, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    elif name == "rag_get_corpus_stats":
        corpus_name = arguments["corpus_name"]

        try:
            corpus = rag.get_corpus(name=corpus_name)
            files = list(rag.list_files(corpus_name=corpus_name))

            total_size = sum(getattr(f, 'size_bytes', 0) for f in files)

            return [TextContent(
                type="text",
                text=json.dumps({
                    "status": "success",
                    "corpus_name": corpus_name,
                    "display_name": corpus.display_name,
                    "description": getattr(corpus, 'description', ''),
                    "file_count": len(files),
                    "total_size_bytes": total_size,
                    "total_size_mb": round(total_size / (1024 * 1024), 2),
                    "create_time": str(getattr(corpus, 'create_time', ''))
                }, indent=2, ensure_ascii=False)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            )]

    return [TextContent(type="text", text=f"Outil inconnu: {name}")]


async def main():
    """Point d'entree principal"""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
