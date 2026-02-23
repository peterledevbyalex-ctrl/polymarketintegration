/**
 * Supabase mock for testing
 */
export const createSupabaseMock = () => {
  const mockData: Record<string, any[]> = {};
  
  const createQueryBuilder = (table: string) => {
    return {
      select: jest.fn((_columns?: string) => {
        const query = {
          eq: jest.fn((column: string, value: any) => {
            // Create result object with proper typing
            // Access mockData at call time, not closure time
            const eqResult: any = {
              single: jest.fn().mockImplementation(() => {
                // Re-filter at call time to get latest data
                const currentFiltered = mockData[table]?.filter((row: any) => row[column] === value) || [];
                return Promise.resolve({
                  data: currentFiltered.length > 0 ? currentFiltered[0] : null,
                  error: currentFiltered.length === 0 ? { message: 'Not found', code: 'PGRST116' } : null,
                });
              }),
              then: (resolve: any) => {
                const currentFiltered = mockData[table]?.filter((row: any) => row[column] === value) || [];
                return Promise.resolve({ data: currentFiltered, error: null }).then(resolve);
              },
            };
            // Allow chaining multiple eq calls
            eqResult.eq = jest.fn((nextColumn: string, nextValue: any) => {
              const currentFiltered = mockData[table]?.filter((row: any) => 
                row[column] === value && row[nextColumn] === nextValue
              ) || [];
              return {
                single: jest.fn().mockResolvedValue({
                  data: currentFiltered.length > 0 ? currentFiltered[0] : null,
                  error: currentFiltered.length === 0 ? { message: 'Not found', code: 'PGRST116' } : null,
                }),
                then: (resolve: any) => Promise.resolve({ data: currentFiltered, error: null }).then(resolve),
              };
            });
            return eqResult;
          }),
          then: (resolve: any) => Promise.resolve({ data: mockData[table] || [], error: null }).then(resolve),
        };
        return query;
      }),
      insert: jest.fn((data: any) => {
        const newRow = Array.isArray(data) ? data[0] : data;
        if (!mockData[table]) mockData[table] = [];
        mockData[table].push(newRow);
        return {
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: newRow,
              error: null,
            }),
          })),
        };
      }),
      update: jest.fn((data: any) => {
        return {
          eq: jest.fn((column: string, value: any) => {
            const index = mockData[table]?.findIndex((row: any) => row[column] === value);
            if (index !== undefined && index >= 0 && mockData[table]) {
              mockData[table][index] = { ...mockData[table][index], ...data };
            }
            return {
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: mockData[table]?.[index] || null,
                  error: null,
                }),
              })),
            };
          }),
        };
      }),
      delete: jest.fn(),
      eq: jest.fn(),
      single: jest.fn(),
    };
  };

  const from = jest.fn((table: string) => createQueryBuilder(table));

  return {
    from,
    mockData,
  };
};
