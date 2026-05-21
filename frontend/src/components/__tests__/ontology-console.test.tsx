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

describe('OntologyConsole', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads backend health on mount', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          ontology_paths: ['knowledge/ontology', 'knowledge/data'],
          ontology_ready: true,
          fuseki_query_endpoint: 'http://localhost:3030/dataset/query',
          openai_model: 'gpt-4.1-mini',
        }),
      ),
    )

    render(<OntologyConsole />)

    await waitFor(() => {
      expect(screen.getByText('Backend listo')).toBeInTheDocument()
    })
    expect(screen.getByText('gpt-4.1-mini')).toBeInTheDocument()
  })

  it('renders response data after a successful question', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            ontology_paths: ['knowledge/ontology', 'knowledge/data'],
            ontology_ready: true,
            fuseki_query_endpoint: 'http://localhost:3030/dataset/query',
            openai_model: 'gpt-4.1-mini',
          }),
        ),
      )
      .mockResolvedValueOnce(
        sseResponse([
          'event: answer_delta\ndata: {"type":"answer_delta","delta":"ABALOPARATIDE aparece ","step":4}\n\n',
          'event: answer_delta\ndata: {"type":"answer_delta","delta":"asociado a osteoporosis.","step":4}\n\n',
          'event: final\ndata: {"type":"final","payload":{"question":"¿Qué fármacos tienen como indicación osteoporosis?","sparql":"SELECT * WHERE { ?drug ?p ?o } LIMIT 10","results":{"head":{"vars":["drug"]},"results":{"bindings":[]}},"answer":"ABALOPARATIDE aparece asociado a osteoporosis.","phases":["planning","schema_discovery","execution","reporting"],"steps":4}}\n\n',
        ]),
    )

    render(<OntologyConsole />)

    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    await waitFor(() => {
      expect(
        screen.getByText('ABALOPARATIDE aparece asociado a osteoporosis.'),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('SELECT * WHERE { ?drug ?p ?o } LIMIT 10')).toBeInTheDocument()
    expect(screen.getByText('Planificación')).toBeInTheDocument()
  })

  it('shows an error when question is empty', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          ontology_paths: ['knowledge/ontology', 'knowledge/data'],
          ontology_ready: true,
          fuseki_query_endpoint: 'http://localhost:3030/dataset/query',
          openai_model: 'gpt-4.1-mini',
        }),
      ),
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
})
