(define-constant CONTRACT (as-contract tx-sender))
(define-constant OWNER tx-sender)

(define-public (mint (to principal))
  (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.nft mint to)
)
