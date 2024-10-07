(define-constant CONTRACT (as-contract tx-sender))
(define-constant OWNER tx-sender)

(define-public (mint-aibtcdev-1 (to principal))
  (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.aibtcdev-airdrop-1 mint to)
)

(define-public (mint-bitcoin-faces (to principal))
  (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.bitcoin-faces-airdrop mint to)
)