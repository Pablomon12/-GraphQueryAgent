import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { OntologyConsole } from '@/components/ontology-console'

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
      expect(screen.getByText('Backend ready')).toBeInTheDocument()
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
        new Response(
          JSON.stringify({
            question: '¿Qué fármacos tienen como indicación osteoporosis?',
            sparql: 'SELECT * WHERE { ?drug ?p ?o } LIMIT 10',
            results: { head: { vars: ['drug'] }, results: { bindings: [] } },
            answer: 'ABALOPARATIDE aparece asociado a osteoporosis.',
            phases: ['planning', 'schema_discovery', 'execution', 'reporting'],
            steps: 4,
          }),
        ),
      )

    render(<OntologyConsole />)

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => {
      expect(
        screen.getByText('ABALOPARATIDE aparece asociado a osteoporosis.'),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('SELECT * WHERE { ?drug ?p ?o } LIMIT 10')).toBeInTheDocument()
    expect(screen.getByText('planning')).toBeInTheDocument()
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

    fireEvent.change(screen.getByLabelText('What do you want to ask the ontology?'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => {
      expect(
        screen.getByText('Write a question before submitting.'),
      ).toBeInTheDocument()
    })
  })
})
