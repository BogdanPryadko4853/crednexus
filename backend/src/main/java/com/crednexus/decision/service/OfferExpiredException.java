package com.crednexus.decision.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class OfferExpiredException extends ResponseStatusException {
    public OfferExpiredException() {
        super(HttpStatus.CONFLICT, "Credit offer has expired");
    }
}
