BETTAZOO - Product Requirements Document (PRD) v2.0
1. Panoramica del Progetto
BETTAZOO è una piattaforma di scommesse Peer-to-Peer (P2P) decentralizzata ("Betting Exchange"). Elimina il bookmaker tradizionale permettendo agli utenti di scommettere l'uno contro l'altro.
Regole Fondamentali: - Nessun token nativo. Tutte le transazioni avvengono esclusivamente in Stablecoin (ERC-20 USDT/USDC) su reti Layer 2 (es. Base o Polygon).

Free Market: I Bettor possono vedere tutte le quote di tutti i Placer in un "Order Book" e scommettere con le quote migliori (Multi-matching).

2. Stack Tecnologico Richiesto
Web3/Smart Contracts: Solidity, Hardhat, Ethers.js.

Backend: Node.js, Express.js.

Database: MongoDB (tramite Mongoose).

Frontend: Next.js (App Router), React, Tailwind CSS.

Web3 Client: wagmi e viem per connessione wallet (MetaMask).

AI & Real-time: OpenAI API (o Anthropic API), Socket.io.

3. Modulo 1: Smart Contract (BettazooEscrow.sol)
Lo Smart Contract agisce come "Cassaforte" (Escrow).

Interazione ERC-20: Gestione depositi e prelievi in mock USDT.

createOffer: Il Placer blocca fondi fornendo eventId, outcome, quota e importo.

acceptOffers: Il Bettor fornisce un array di ID offerta per coprire la sua puntata (Multi-matching). Il contratto blocca i fondi del Bettor e aggiorna le rimanenze delle offerte dei Placer.

resolveEvent: Richiamabile solo dall'Admin/Oracolo. Sblocca i fondi al vincitore e invia una trattenuta del 5% (Rake) al wallet aziendale (Treasury).

4. Modulo 2: Backend e Matching Engine (Node.js)
Aggregatore dati off-chain per garantire velocità e usabilità.

Order Book API: Endpoint che, dato un eventId, restituisce tutte le offerte "Unmatched" ordinate dalla quota migliore alla peggiore.

Web3 Listener: Sincronizza il database MongoDB ascoltando gli eventi emessi dallo Smart Contract.

Oracle Service (Mock): Simula il feed di Betradar, aggiornando i risultati e chiamando la funzione on-chain resolveEvent quando un match finisce.

AI Endpoint (/api/ai/suggest-odds): Riceve i dati di un evento e interroga l'LLM (tramite API) per restituire in formato JSON le quote ottimali suggerite per il Placer.

5. Modulo 3: Frontend & UX (Next.js)
Interfaccia "Frictionless", niente login tradizionale, solo "Connect Wallet".

Exchange View (Bettor): Lista eventi. Selezionando un evento, l'utente vede l'Order Book. Scegliendo l'importo, il frontend calcola il multi-matching e prepara la singola firma Web3.

Placer Dashboard: Pannello per creare le offerte, annullare gli ordini non abbinati e monitorare il rischio.

Streaming Mock: Profilo del Placer con finto player video in loop, chat live (Socket.io) e lista delle quote esclusive di quel Placer.

6. Modulo 4: L'Assistente AI per Placer
AI Odds Suggester: Nel form di creazione scommessa del Placer, un bottone "Chiedi all'AI" popola automaticamente le quote calcolando un margine matematico sicuro.

Risk Manager: Un widget nella dashboard che analizza l'esposizione del Placer e avvisa in caso di sbilanciamento eccessivo su un singolo esito.