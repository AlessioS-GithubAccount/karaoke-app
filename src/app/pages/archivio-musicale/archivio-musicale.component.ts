import { Component, OnInit } from '@angular/core'; 
import { KaraokeService } from '../../services/karaoke.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-archivio-musicale',
  templateUrl: './archivio-musicale.component.html',
  styleUrls: ['./archivio-musicale.component.scss']
})
export class ArchivioMusicaleComponent implements OnInit {
  archivio: any[] = [];
  isAdmin: boolean = false;
  isUser: boolean = false;
  isGuest: boolean = false;
  canUseActions: boolean = false;
  searchText: string = '';

  constructor(
    private karaokeService: KaraokeService,
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private translate: TranslateService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    const ruolo = this.authService.getRole();

    this.isAdmin = ruolo === 'admin';
    this.isUser = ruolo === 'user' || ruolo === 'client';
    this.isGuest = ruolo === 'guest';
    this.canUseActions = this.isAdmin || this.isUser;

    this.karaokeService.getArchivioMusicale().subscribe({
      next: (data) => {
        this.archivio = data.filter((item, index, self) =>
          index === self.findIndex((t) =>
            t.canzone === item.canzone && t.artista === item.artista
          )
        );
      },
      error: (err) => {
        this.translate.get('toast.ERROR_CHARGING').subscribe(msg => {
          this.toastr.error(msg);
        });
      }
    });
  }

    scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

scrollToBottom(): void {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

  aggiungiAWishlist(item: any): void {
    this.karaokeService.aggiungiAWishlist({
      user_id: item.id,
      artista: item.artista,
      canzone: item.canzone
    }).subscribe({
      next: () => {
        this.translate.get('toast.WISHLIST_ADD', {
          canzone: item.canzone,
          artista: item.artista
        }).subscribe(msg => {
          this.toastr.success(msg);
        });
      },
      error: (err) => {
        this.translate.get('toast.WISHLIST_ERROR').subscribe(msg => {
          this.toastr.error(msg);
        });
      }
    });
  }

  get archivioFiltrato(): any[] {
    const search = this.searchText.trim().toLowerCase();
    if (!search) return this.archivio;

    return this.archivio.filter(c => {
      const parole = (c.artista + ' ' + c.canzone).toLowerCase().split(/\s+/);
      return parole.some(parola => parola.startsWith(search));
    });
  }

 eliminaCanzone(id: number): void {
  this.translate.get('toast.DELETE_CONFIRM').subscribe(traduzione => {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: { message: traduzione }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.karaokeService.deleteFromArchivio(id).subscribe({
          next: () => {
            this.archivio = this.archivio.filter(c => c.id !== id);
            this.translate.get('toast.CONFIRM_DELETE').subscribe(msg => {
              this.toastr.success(msg);
            });
          },
          error: () => {
            this.translate.get('toast.ERROR_LIST').subscribe(msg => {
              this.toastr.error(msg);
            });
          }
        });
      }
    });
  });
}


  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
    this.translate.get('toast.logoutSuccesso').subscribe(msg => {
      this.toastr.info(msg);
    });
  }
}
