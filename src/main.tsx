import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentFloor } from './AgentFloor';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AgentFloor /></StrictMode>);