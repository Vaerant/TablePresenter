import { NextResponse } from 'next/server';
import { sermonSearch } from '@/lib/sermonSearch';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const method = searchParams.get('method') || 'text';
    const query = searchParams.get('q');

    if (!query && method !== 'sermons') {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    let results;

    switch (method) {
      case 'text':
        const caseSensitive = searchParams.get('caseSensitive') === 'true';
        const wholeWords = searchParams.get('wholeWords') === 'true';
        const includeContext = searchParams.get('includeContext') !== 'false';
        
        results = await sermonSearch.searchText(query, {
          caseSensitive,
          wholeWords,
          includeContext
        });
        break;

      case 'phrase':
        const proximity = parseInt(searchParams.get('proximity')) || 5;
        const exactPhrase = searchParams.get('exactPhrase') === 'true';
        
        results = await sermonSearch.searchPhrase(query, {
          proximity,
          exactPhrase
        });
        break;

      case 'boolean':
        results = await sermonSearch.searchBoolean(query);
        break;

      case 'blockType':
        const blockType = searchParams.get('blockType');
        if (!blockType) {
          return NextResponse.json(
            { error: 'blockType parameter is required for blockType search' },
            { status: 400 }
          );
        }
        results = await sermonSearch.searchByBlockType(query, blockType);
        break;

      case 'sermons':
        const filters = {
          title: searchParams.get('title'),
          date: searchParams.get('date'),
          id: searchParams.get('id'),
          uid: searchParams.get('uid')
        };
        
        const dateStart = searchParams.get('dateStart');
        const dateEnd = searchParams.get('dateEnd');
        if (dateStart && dateEnd) {
          filters.dateRange = { start: dateStart, end: dateEnd };
        }
        
        results = await sermonSearch.searchSermons(filters);
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid search method' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      method,
      query,
      results,
      total: results.length
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { method, query, options = {} } = body;

    if (!query && method !== 'sermons') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    let results;

    switch (method) {
      case 'text':
        results = await sermonSearch.searchText(query, options);
        break;
      case 'phrase':
        results = await sermonSearch.searchPhrase(query, options);
        break;
      case 'boolean':
        results = await sermonSearch.searchBoolean(query, options);
        break;
      case 'blockType':
        if (!options.blockType) {
          return NextResponse.json(
            { error: 'blockType is required in options' },
            { status: 400 }
          );
        }
        results = await sermonSearch.searchByBlockType(query, options.blockType, options);
        break;
      case 'sermons':
        results = await sermonSearch.searchSermons(options);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid search method' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      method,
      query,
      results,
      total: results.length
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}