(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant DEPLOYER tx-sender)

(define-data-var nextId uint u1)
(define-data-var domain (string-ascii 216) "http://dummy.com/id=")

(define-non-fungible-token nft uint)

(define-read-only (get-last-token-id) (ok (- (var-get nextId) u1)))
(define-read-only (get-token-uri (id uint)) (ok (some (concat (var-get domain) (int-to-ascii id)))))
(define-read-only (get-owner (id uint)) (ok (nft-get-owner? nft id)))

(define-public (transfer (id uint) (from principal) (to principal))
  (if (or (is-eq from tx-sender) (is-eq from contract-caller))
    (nft-transfer? nft id from to)
    (err u4)
  )
)

(define-public (mint (to principal))
  (let ((id (var-get nextId)))
    (asserts! (is-eq DEPLOYER (get-standard-caller)) (err u401))
    (var-set nextId (+ id u1))
    (nft-mint? nft id to)
  )
)

(define-public (set-domain (new (string-ascii 216)))
  (if (is-eq DEPLOYER (get-standard-caller))
    (ok (var-set domain new))
    (err u401)
  )
)

(define-public (airdrop (l1 (list 7084 principal)) (l2 (list 7084 principal)))
  (begin 
    (asserts! (is-eq DEPLOYER (get-standard-caller)) (err u401))
    (ok (var-set nextId (fold drop l2 (fold drop l1 (var-get nextId)))))
  )
)

(define-private (drop (to principal) (id uint))
  (begin (is-err (nft-mint? nft id to)) (+ id u1))
)

(define-read-only (get-standard-caller)
  (let ((d (unwrap-panic (principal-destruct? contract-caller))))
    (unwrap-panic (principal-construct? (get version d) (get hash-bytes d)))
  )
)
