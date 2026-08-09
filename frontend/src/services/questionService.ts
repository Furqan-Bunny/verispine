import api from './api';

export interface Question {
  id: string;
  productId: string;
  productTitle: string;
  userId: string;
  userName: string;
  question: string;
  answer: string | null;
  answeredBy: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
  createdAt: string;
}

class QuestionService {
  async getProductQuestions(productId: string): Promise<Question[]> {
    try {
      const response = await api.get(`/questions/product/${productId}`);
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch questions');
    }
  }

  async askQuestion(productId: string, question: string): Promise<Question> {
    try {
      const response = await api.post('/questions', { productId, question });
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to submit question');
    }
  }

  async answerQuestion(questionId: string, answer: string): Promise<void> {
    try {
      await api.put(`/questions/${questionId}/answer`, { answer });
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to submit answer');
    }
  }

  async deleteQuestion(questionId: string): Promise<void> {
    try {
      await api.delete(`/questions/${questionId}`);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to delete question');
    }
  }
}

export default new QuestionService();
