import io from 'socket.io-client';
import { writable, get } from 'svelte/store';
import { CandlePair } from './market'; // Import your CandlePair store
import { MRM_SOCKET_URL } from '../helpers/constants';

function createSocket() {
  const { subscribe, set } = writable(null);

  let socket: any;
  let currentPair = get(CandlePair); // Get the current value of the CandlePair store

  const connect = () => {
    // Initialize the socket connection if it's not already established
    if (!socket) {
      socket = io(MRM_SOCKET_URL);

      socket.on('connect', () => {
        console.log('Socket connected');
        // Subscribe to the initial order book channel
        subscribeToOrderBook(currentPair);
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
        set(null);
      });

      set(socket);
    }
  };

  const subscribeToOrderBook = (pair: any) => {
    if (socket) {
      // Unsubscribe from the previous order book channel if necessary
      if (currentPair) {
        socket.emit('unsubscribe', currentPair);
      }
      // Subscribe to the new order book channel
      socket.emit('subscribe', pair);
      currentPair = pair;
    }
  };

  // Reactively update the order book subscription when CandlePair changes
  CandlePair.subscribe(($CandlePair) => {
    if ($CandlePair !== currentPair) {
      subscribeToOrderBook($CandlePair);
    }
  });

  const disconnect = () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  return {
    subscribe,
    connect,
    disconnect
  };
}

export const orderBookSocket = createSocket();
