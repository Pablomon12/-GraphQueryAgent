import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { OntologyConsole } from '@/components/ontology-console'

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
    },
  })
}

function healthPayload(huggingFaceConfigured = false) {
  return {
    status: 'ok',
    ontology_paths: ['knowledge/ontology', 'knowledge/data'],
    ontology_ready: true,
    fuseki_query_endpoint: 'http://localhost:3030/dataset/query',
    graphrag_api_base_url: 'http://localhost:8001',
    default_llm_provider: 'openai',
    llm_providers: [
      {
        id: 'openai',
        label: 'OpenAI',
        model: 'gpt-4.1-mini',
        configured: true,
      },
      {
        id: 'huggingface',
        label: 'Hugging Face',
        model: 'Qwen/Qwen3-4B-Instruct-2507:nscale',
        configured: huggingFaceConfigured,
      },
    ],
    openai_model: 'gpt-4.1-mini',
  }
}

describe('OntologyConsole', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads backend health on mount', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(healthPayload())),
    )

    render(<OntologyConsole />)

    await waitFor(() => {
      expect(screen.getByText('Backend listo')).toBeInTheDocument()
    })
    expect(screen.getByText('OpenAI · gpt-4.1-mini')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OpenAI' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Hugging Face' })).toBeDisabled()
  })

  it('renders response data after a successful question', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(healthPayload())))
      .mockResolvedValueOnce(
        sseResponse([
          'event: answer_delta\ndata: {"type":"answer_delta","delta":"ABALOPARATIDE aparece ","step":4}\n\n',
          'event: answer_delta\ndata: {"type":"answer_delta","delta":"asociado a osteoporosis.","step":4}\n\n',
          'event: final\ndata: {"type":"final","payload":{"question":"¿Qué fármacos tienen como indicación osteoporosis?","sparql":"SELECT * WHERE { ?drug ?p ?o } LIMIT 10","results":{"head":{"vars":["drug"]},"results":{"bindings":[]}},"answer":"ABALOPARATIDE aparece asociado a osteoporosis.","phases":["planning","schema_discovery","execution","reporting"],"steps":4}}\n\n',
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          'event: answer_delta\ndata: {"type":"answer_delta","delta":"El modelo base menciona osteoporosis.","step":1}\n\n',
          'event: final\ndata: {"type":"final","payload":{"question":"¿Qué fármacos tienen como indicación osteoporosis?","answer":"El modelo base menciona osteoporosis.","steps":1}}\n\n',
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          'event: answer_delta\ndata: {"type":"answer_delta","delta":"GraphRAG recupera evidencia sobre osteoporosis.","step":1}\n\n',
          'event: final\ndata: {"type":"final","payload":{"question":"¿Qué fármacos tienen como indicación osteoporosis?","answer":"GraphRAG recupera evidencia sobre osteoporosis.","results":{"evidence":[]},"steps":1}}\n\n',
        ]),
    )

    render(<OntologyConsole />)

    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    await waitFor(() => {
      expect(
        screen.getAllByText('ABALOPARATIDE aparece asociado a osteoporosis.').length,
      ).toBeGreaterThan(0)
    })
    expect(screen.getByText('El modelo base menciona osteoporosis.')).toBeInTheDocument()
    expect(screen.getByText('GraphRAG recupera evidencia sobre osteoporosis.')).toBeInTheDocument()
    expect(screen.getByText('SELECT * WHERE { ?drug ?p ?o } LIMIT 10')).toBeInTheDocument()
    expect(screen.getByText('Planificación')).toBeInTheDocument()
  })

  it('shows an error when question is empty', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(healthPayload())),
    )

    render(<OntologyConsole />)

    fireEvent.change(screen.getByLabelText('Pregunta para la ontología'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    await waitFor(() => {
      expect(
        screen.getByText('Escribe una pregunta antes de consultar.'),
      ).toBeInTheDocument()
    })
  })

  it('renders the comparison dashboard', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(healthPayload())),
    )

    render(<OntologyConsole />)

    await waitFor(() => {
      expect(screen.getByText('Backend listo')).toBeInTheDocument()
    })
    expect(screen.getByText('Evaluación comparativa')).toBeInTheDocument()
    expect(screen.getAllByText('Agente semántico').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Modelo base').length).toBeGreaterThan(0)
    expect(screen.getAllByText('GraphRAG').length).toBeGreaterThan(0)
    expect(
      screen.getByText('¿Cuántos fármacos hay por cada tipo de fármaco?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Precision / recall / F1')).toBeInTheDocument()
  })

  it('runs an experiment when loading a question', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(healthPayload())),
    ).mockResolvedValueOnce(
      sseResponse([
        'event: answer_delta\ndata: {"type":"answer_delta","delta":"ABARELIX tiene como mecanismo ","step":4}\n\n',
        'event: answer_delta\ndata: {"type":"answer_delta","delta":"Gonadotropin-releasing hormone receptor antagonist y diana GNRHR.","step":4}\n\n',
        'event: final\ndata: {"type":"final","payload":{"question":"¿Qué mecanismo de acción y qué diana tiene ABARELIX?","sparql":"SELECT ?mechanism ?target WHERE { ?s ?p ?o }","results":{"results":{"bindings":[]}},"answer":"ABARELIX tiene como mecanismo Gonadotropin-releasing hormone receptor antagonist y diana GNRHR.","phases":["planning","schema_discovery","execution","reporting"],"steps":4}}\n\n',
      ]),
    ).mockResolvedValueOnce(
      sseResponse([
        'event: answer_delta\ndata: {"type":"answer_delta","delta":"ABARELIX se relaciona ","step":1}\n\n',
        'event: answer_delta\ndata: {"type":"answer_delta","delta":"con GNRHR.","step":1}\n\n',
        'event: final\ndata: {"type":"final","payload":{"question":"¿Qué mecanismo de acción y qué diana tiene ABARELIX?","answer":"ABARELIX se relaciona con GNRHR.","steps":1}}\n\n',
      ]),
    ).mockResolvedValueOnce(
      sseResponse([
        'event: answer_delta\ndata: {"type":"answer_delta","delta":"GraphRAG recupera ABARELIX con mecanismo Gonadotropin-releasing hormone receptor antagonist y GNRHR.","step":1}\n\n',
        'event: final\ndata: {"type":"final","payload":{"question":"¿Qué mecanismo de acción y qué diana tiene ABARELIX?","answer":"GraphRAG recupera ABARELIX con mecanismo Gonadotropin-releasing hormone receptor antagonist y GNRHR.","results":{"evidence":[{"drug":"ABARELIX"}]},"steps":1}}\n\n',
      ]),
    )

    render(<OntologyConsole />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Cargar' })[2])

    await waitFor(() => {
      expect(screen.getByLabelText('Pregunta para la ontología')).toHaveValue(
        '¿Qué mecanismo de acción y qué diana tiene ABARELIX?',
      )
    })
    await waitFor(() => {
      expect(screen.getByText('1/4 ejecutadas')).toBeInTheDocument()
    })
    expect(screen.getByText('Comparado')).toBeInTheDocument()
    expect(screen.getByText('ABARELIX se relaciona con GNRHR.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'GraphRAG recupera ABARELIX con mecanismo Gonadotropin-releasing hormone receptor antagonist y GNRHR.',
      ),
    ).toBeInTheDocument()
  })

  it('sends the selected Hugging Face provider with semantic and baseline requests', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(healthPayload(true))))
      .mockResolvedValueOnce(
        sseResponse([
          'event: final\ndata: {"type":"final","payload":{"question":"¿Qué fármacos tienen como indicación osteoporosis?","sparql":null,"results":null,"answer":"Respuesta HF agente.","phases":[],"steps":1}}\n\n',
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          'event: final\ndata: {"type":"final","payload":{"question":"¿Qué fármacos tienen como indicación osteoporosis?","answer":"Respuesta HF base.","steps":1}}\n\n',
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          'event: final\ndata: {"type":"final","payload":{"question":"¿Qué fármacos tienen como indicación osteoporosis?","answer":"Respuesta GraphRAG.","results":null,"steps":1}}\n\n',
        ]),
      )

    render(<OntologyConsole />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hugging Face' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face' }))
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    await waitFor(() => {
      expect(screen.getByText('Respuesta HF agente.')).toBeInTheDocument()
    })

    const semanticRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    const baselineRequest = JSON.parse(String(fetchMock.mock.calls[2][1]?.body))
    expect(semanticRequest.llm_provider).toBe('huggingface')
    expect(baselineRequest.llm_provider).toBe('huggingface')
  })
})
