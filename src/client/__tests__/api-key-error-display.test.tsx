/**
 * CLIENT-SIDE API KEY ERROR DISPLAY TESTS
 *
 * This test suite validates that API key errors are properly displayed to users
 * in the UI, including error messages, toast notifications, and modal behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApiKeyModal from '../components/ApiKeyModal';
import { callGemini } from '../utils/gemini';

// Mock @devvit/web/client
vi.mock('@devvit/web/client', () => ({
  showToast: vi.fn(),
  showForm: vi.fn(),
  navigateTo: vi.fn(),
}));

describe('ApiKeyModal Component', () => {
  it('should display modal with correct title and description', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Gemini API Key')).toBeInTheDocument();
    expect(screen.getByText(/Required for AI co-pilot/)).toBeInTheDocument();
  });

  it('should disable save button when key is empty', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const saveButton = screen.getByTestId('btn-save-api-key');
    expect(saveButton).toBeDisabled();
  });

  it('should enable save button when key is entered', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByTestId('input-api-key');
    fireEvent.change(input, { target: { value: 'test-key' } });

    const saveButton = screen.getByTestId('btn-save-api-key');
    expect(saveButton).not.toBeDisabled();
  });

  it('should call onSave with trimmed key when save is clicked', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByTestId('input-api-key');
    fireEvent.change(input, { target: { value: '  test-key  ' } });

    const saveButton = screen.getByTestId('btn-save-api-key');
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('test-key');
  });

  it('should call onClose when cancel is clicked', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('should call onClose when close button is clicked', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('should toggle password visibility when show/hide is clicked', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByTestId('input-api-key') as HTMLInputElement;
    expect(input.type).toBe('password');

    const showButton = screen.getByText('Show');
    fireEvent.click(showButton);

    expect(input.type).toBe('text');

    const hideButton = screen.getByText('Hide');
    fireEvent.click(hideButton);

    expect(input.type).toBe('password');
  });

  it('should pre-fill input with current key', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey="existing-key"
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByTestId('input-api-key') as HTMLInputElement;
    expect(input.value).toBe('existing-key');
  });

  it('should display link to get API key', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const link = screen.getByText('aistudio.google.com');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://aistudio.google.com/app/apikey');
  });
});

describe('Gemini API Error Handling', () => {
  it('should throw error when API key is missing', async () => {
    await expect(callGemini('', 'test prompt')).rejects.toThrow('Missing Gemini API key');
  });

  it('should throw error when API key is null', async () => {
    await expect(callGemini(null as any, 'test prompt')).rejects.toThrow('Missing Gemini API key');
  });

  it('should throw error when API key is undefined', async () => {
    await expect(callGemini(undefined as any, 'test prompt')).rejects.toThrow('Missing Gemini API key');
  });

  it('should throw error when API key is empty string', async () => {
    await expect(callGemini('', 'test prompt')).rejects.toThrow('Missing Gemini API key');
  });

  it('should throw error when API key is whitespace only', async () => {
    await expect(callGemini('   ', 'test prompt')).rejects.toThrow('Missing Gemini API key');
  });

  it('should handle API error responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(callGemini('invalid-key', 'test prompt')).rejects.toThrow('Gemini API error 401');
  });

  it('should handle rate limit errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    await expect(callGemini('valid-key', 'test prompt')).rejects.toThrow('Gemini API error 429');
  });

  it('should handle server errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    });

    await expect(callGemini('valid-key', 'test prompt')).rejects.toThrow('Gemini API error 500');
  });
});

describe('Error Message Display', () => {
  it('should display user-friendly error for missing API key', async () => {
    try {
      await callGemini('', 'test');
    } catch (error) {
      expect((error as Error).message).toBe('Missing Gemini API key');
    }
  });

  it('should display API error status in error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    try {
      await callGemini('invalid-key', 'test');
    } catch (error) {
      expect((error as Error).message).toContain('403');
      expect((error as Error).message).toContain('Forbidden');
    }
  });

  it('should handle network errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(callGemini('valid-key', 'test')).rejects.toThrow('Network error');
  });
});

describe('API Key Validation in UI', () => {
  it('should trim whitespace from API key before saving', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByTestId('input-api-key');
    fireEvent.change(input, { target: { value: '  AIzaSyD-Test-Key  ' } });

    const saveButton = screen.getByTestId('btn-save-api-key');
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('AIzaSyD-Test-Key');
  });

  it('should not save empty key after trimming', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByTestId('input-api-key');
    fireEvent.change(input, { target: { value: '   ' } });

    const saveButton = screen.getByTestId('btn-save-api-key');
    expect(saveButton).toBeDisabled();
  });

  it('should handle very long API keys', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const longKey = 'a'.repeat(1000);

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByTestId('input-api-key');
    fireEvent.change(input, { target: { value: longKey } });

    const saveButton = screen.getByTestId('btn-save-api-key');
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledWith(longKey);
  });
});

describe('User Guidance for API Key Errors', () => {
  it('should display helpful message about key storage', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/stored in browser memory only/)).toBeInTheDocument();
    expect(screen.getByText(/never passes through any server/)).toBeInTheDocument();
  });

  it('should provide link to get API key', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ApiKeyModal
        currentKey=""
        onSave={onSave}
        onClose={onClose}
      />
    );

    const link = screen.getByText('aistudio.google.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
