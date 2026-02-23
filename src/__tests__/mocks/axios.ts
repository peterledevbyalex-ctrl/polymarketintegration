/**
 * Axios mock for testing
 * Note: jest.mock('axios') must be called in each test file that uses axios
 */

export const mockAxiosResponse = <T>(data: T, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config: {} as any,
});

export const mockAxiosError = (message: string, status = 500) => {
  const error = new Error(message) as any;
  error.response = {
    data: { message },
    status,
    statusText: 'Error',
    headers: {},
    config: {} as any,
  };
  return error;
};
